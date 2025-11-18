
'use server';

import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';
import { Database, Tables, TablesInsert, TablesUpdate } from '@/lib/types';
import { revalidatePath } from 'next/cache';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomUUID } from 'crypto';
import { differenceInSeconds, startOfDay, endOfDay, subDays, format, startOfMonth, endOfMonth } from 'date-fns';
import { fetchAllMemberNames, fetchSingleMemberName } from '@/lib/name-api';

type MemberUser = Tables<'member', 'users'>;
type AttendanceUser = Tables<'attendance', 'users'>;
type Team = Tables<'member', 'teams'>;

type UserWithTeam = MemberUser & { teams: Team[] | null };

export async function recordAttendance(cardId: string): Promise<{ success: boolean; message: string; user: MemberUser | null; type: 'in' | 'out' | null; }> {
  const supabase = createSupabaseAdminClient();
  
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();

  const { data: attendanceUser, error: attendanceUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('id, user_profile:member_users(display_name)')
    .eq('card_id', normalizedCardId)
    .single();

  if (attendanceUserError || !attendanceUser) {
    return { success: false, message: '未登録のカードです。', user: null, type: null };
  }

  const userId = attendanceUser.id;
  // @ts-ignore
  const userDisplayName = attendanceUser.user_profile?.display_name || '名無しさん';

  const { data: lastAttendance, error: lastAttendanceError } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('type')
    .eq('user_id', userId)
    .order('timestamp', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastAttendanceError) {
      console.error('Error fetching last attendance:', lastAttendanceError);
      return { success: false, message: '過去の打刻記録の取得中にエラーが発生しました。', user: null, type: null };
  }

  const attendanceType = lastAttendance?.type === 'in' ? 'out' : 'in';

  const { error: insertError } = await supabase
    .schema('attendance')
    .from('attendances')
    .insert({ user_id: userId, type: attendanceType });

  if (insertError) {
    console.error('Attendance insert error:', insertError);
    return { success: false, message: '打刻処理中にエラーが発生しました。', user: null, type: null };
  }
  
  revalidatePath('/dashboard/teams');
  return { 
    success: true, 
    message: attendanceType === 'in' ? '出勤しました' : '退勤しました',
    user: { display_name: userDisplayName } as MemberUser,
    type: attendanceType,
  };
}


export async function createTempRegistration(cardId: string): Promise<{ success: boolean; token?: string; message: string }> {
  const supabase = createSupabaseAdminClient();
  const normalizedCardId = cardId.replace(/:/g, '').toLowerCase();
  
  const { data: existingUser, error: existingUserError } = await supabase
    .schema('attendance')
    .from('users')
    .select('id')
    .eq('card_id', normalizedCardId)
    .single();

  if (existingUserError && existingUserError.code !== 'PGRST116') { // Ignore "No rows found" error
    console.error("Error checking for existing user:", existingUserError);
    return { success: false, message: "ユーザーの確認中にエラーが発生しました。" };
  }
  
  if (existingUser) {
    return { success: false, message: 'このカードは既に登録されています。' };
  }

  const token = `qr_${randomUUID()}`;
  const expires_at = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  
  const { error } = await supabase.schema('attendance').from('temp_registrations').upsert(
    { card_id: normalizedCardId, qr_token: token, expires_at: expires_at, is_used: false },
    { onConflict: 'card_id', ignoreDuplicates: false }
  );
  
  if (error) {
    console.error("Temp registration error:", error);
    return { success: false, message: "仮登録中にエラーが発生しました。" };
  }

  return { success: true, token, message: "QRコードを生成しました。" };
}

export async function getTempRegistration(token: string) {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase
        .schema('attendance')
        .from('temp_registrations')
        .select('*')
        .eq('qr_token', token)
        .single();
    if (error || !data) return null;

    if (!data.accessed_at) {
        const admin = createSupabaseAdminClient();
        await admin.schema('attendance').from('temp_registrations').update({ accessed_at: new Date().toISOString() }).eq('id', data.id);
    }

    return data;
}

export async function completeRegistration(formData: FormData) {
  const token = formData.get('token') as string;
  // displayName is now fetched from API
  const generation = Number(formData.get('generation'));
  const teamId = Number(formData.get('teamId'));
  const studentNumber = formData.get('studentNumber') as string;
  const status = Number(formData.get('status'));

  if (!token || !generation || !teamId || !studentNumber || status === null) {
    return redirect(`/register/${token}?error=Missing form data`);
  }

  const supabase = createSupabaseServerClient();
  const adminSupabase = createSupabaseAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.user_metadata.provider_id) {
    return redirect(`/register/${token}?error=Not authenticated`);
  }
  const discordId = user.user_metadata.provider_id;

  const { data: tempReg, error: tempRegError } = await adminSupabase
    .schema('attendance')
    .from('temp_registrations')
    .select('*')
    .eq('qr_token', token)
    .single();

  if (tempRegError || !tempReg) {
    return redirect(`/register/${token}?error=Invalid session`);
  }
  if (tempReg.is_used) {
    return redirect(`/register/${token}?error=Session already used`);
  }
  if (new Date(tempReg.expires_at) < new Date()) {
    return redirect(`/register/${token}?error=Session expired`);
  }

  // Fetch real name from API
  const realName = await fetchSingleMemberName(discordId);
  if (!realName) {
      return redirect(`/register/${token}?error=Failed to fetch user name from API. Make sure user is in the Discord server.`);
  }

  // 1. Create user in `member.users`
  const memberData: TablesInsert<'member', 'users'> = {
    id: user.id,
    display_name: realName,
    discord_id: discordId,
    generation: generation,
    student_number: studentNumber,
    status: status,
    is_admin: false,
  };

  const { error: insertMemberError } = await adminSupabase.schema('member').from('users').insert(memberData);

  if (insertMemberError) {
    console.error("Error inserting member:", insertMemberError);
    if(insertMemberError.code === '23505') { // unique constraint violation
       // Try to update existing user that might not be fully registered
       const { error: updateError } = await adminSupabase.schema('member').from('users').update(memberData).eq('id', user.id);
       if(updateError) {
          return redirect(`/register/${token}?error=User already exists and failed to update: ${updateError.message}`);
       }
    } else {
      return redirect(`/register/${token}?error=${insertMemberError.message}`);
    }
  }

  // 2. Create user in `attendance.users`
  const attendanceUserData: TablesInsert<'attendance', 'users'> = {
      id: user.id,
      card_id: tempReg.card_id
  }
  const { error: insertAttendanceUserError } = await adminSupabase.schema('attendance').from('users').upsert(attendanceUserData, { onConflict: 'id' });
  if (insertAttendanceUserError) {
      console.error("Error creating attendance user link:", insertAttendanceUserError);
      return redirect(`/register/${token}?error=Failed to link card to user.`);
  }

  // 3. Link user to team in `member.member_team_relations`
  const { error: insertTeamRelError } = await adminSupabase.schema('member').from('member_team_relations').upsert({
      member_id: user.id,
      team_id: teamId
  }, { onConflict: 'member_id' });
  if (insertTeamRelError) {
      console.error("Error creating team relation:", insertTeamRelError);
       return redirect(`/register/${token}?error=Failed to add user to team.`);
  }
  
  // 4. Mark temp registration as used
  await adminSupabase.schema('attendance').from('temp_registrations').update({ is_used: true }).eq('id', tempReg.id);

  revalidatePath('/admin');
  redirect(`/register/${token}?success=true`);
}


export async function signInWithDiscord() {
    const supabase = createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'discord',
        options: {
            redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
            scopes: 'identify guilds',
            queryParams: {
                prompt: 'consent',
            },
        },
    });

    if (error) {
        console.error('Sign in with Discord error:', error);
        return redirect('/login?error=Could not authenticate with Discord.');
    }

    if (data.url) {
        redirect(data.url);
    }
}

export async function signInAsAnonymousAdmin() {
    const adminSupabase = createSupabaseAdminClient();
    const supabase = createSupabaseServerClient();
    const email = 'admin@example.com';
    const password = 'password';

    const { data: { users }, error: listUsersError } = await adminSupabase.auth.admin.listUsers();
    if (listUsersError) {
        console.error('Error listing users:', listUsersError);
        return redirect('/login?error=Failed to list users.');
    }

    let authUser = users.find(u => u.email === email);

    if (!authUser) {
        const { data: newAuthUserData, error: createAuthUserError } = await adminSupabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (createAuthUserError || !newAuthUserData.user) {
            console.error('Error creating anonymous admin auth user:', createAuthUserError);
            return redirect(`/login?error=${createAuthUserError?.message || 'Failed to create user'}`);
        }
        authUser = newAuthUserData.user;
    }
    
    if (!authUser) {
         return redirect('/login?error=Could not create or find anonymous admin user.');
    }

    // Check if member profile exists
    const { data: memberProfile } = await adminSupabase.schema('member').from('users').select('id').eq('id', authUser.id).single();
    if (!memberProfile) {
        const { error: createMemberError } = await adminSupabase.schema('member').from('users').insert({
            id: authUser.id,
            display_name: '匿名管理者',
            discord_id: 'anonymous_admin',
            generation: 0,
            status: 2,
            is_admin: true,
        });
        if (createMemberError) {
             return redirect(`/login?error=${createMemberError.message}`);
        }
    }

    // Check if attendance profile exists
    const { data: attendanceProfile } = await adminSupabase.schema('attendance').from('users').select('id').eq('id', authUser.id).single();
    if (!attendanceProfile) {
         const { error: createAttendanceUserError } = await adminSupabase.schema('attendance').from('users').insert({
            id: authUser.id,
            card_id: `admin_${randomUUID().slice(0,8)}`,
        });
        if (createAttendanceUserError) {
            return redirect(`/login?error=${createAttendanceUserError.message}`);
        }
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
    });

    if (signInError) {
        console.error('Sign in error:', signInError);
        return redirect(`/login?error=${signInError.message}`);
    }

    revalidatePath('/', 'layout');
    redirect('/dashboard');
}


export async function signOut() {
    cookies().getAll();
    const supabase = createSupabaseServerClient();
    await supabase.auth.signOut();
    revalidatePath('/', 'layout');
    return redirect('/login');
}

export async function getMonthlyAttendance(userId: string, month: Date) {
  const supabase = createSupabaseServerClient();
  const start = startOfMonth(month);
  const end = endOfMonth(month);
  
  const { data, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('date, type')
    .eq('user_id', userId)
    .gte('date', format(start, 'yyyy-MM-dd'))
    .lte('date', format(end, 'yyyy-MM-dd'))
    .order('timestamp', { ascending: true });

  if (error) {
    console.error('Error fetching monthly attendance:', error);
    return [];
  }

  const dailyStatus: Record<string, 'in' | 'out' | 'mixed'> = {};
  data.forEach(att => {
    const date = att.date;
    dailyStatus[date] = att.type as 'in' | 'out';
  });

  return Object.keys(dailyStatus).map(date => ({
    date,
    status: dailyStatus[date]
  }));
}

export async function getMonthlyAttendanceSummary(month: Date) {
  const supabase = createSupabaseAdminClient();
  const start = format(startOfMonth(month), 'yyyy-MM-dd');
  const end = format(endOfMonth(month), 'yyyy-MM-dd');

  const { data, error } = await supabase.rpc('get_monthly_attendance_summary', { start_date: start, end_date: end });


  if (error) {
    console.error('Error fetching monthly attendance summary:', error);
    return {};
  }

  type DailySummary = {
    total: number;
    byTeam: Record<string, { name: string; total: number; byGeneration: Record<number, number> }>;
  };

  const summary: Record<string, DailySummary> = {};

  if (data) {
    for (const record of data) {
        const { date, team_id, team_name, generation, count } = record;
        if (!date || !team_id || !team_name) continue;

        const dateKey = format(new Date(date), 'yyyy-MM-dd');

        if (!summary[dateKey]) {
            summary[dateKey] = { total: 0, byTeam: {} };
        }
        
        if (!summary[dateKey].byTeam[team_id]) {
            summary[dateKey].byTeam[team_id] = { name: team_name, total: 0, byGeneration: {} };
        }
        
        summary[dateKey].total += count;
        summary[dateKey].byTeam[team_id].total += count;
        summary[dateKey].byTeam[team_id].byGeneration[generation] = (summary[dateKey].byTeam[team_id].byGeneration[generation] || 0) + count;
    }
  }
  return summary;
}


export async function calculateTotalActivityTime(userId: string, days: number): Promise<number> {
  const supabase = createSupabaseServerClient();
  const startDate = subDays(new Date(), days).toISOString();

  const { data: attendances, error } = await supabase
    .schema('attendance')
    .from('attendances')
    .select('type, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', startDate)
    .order('timestamp', { ascending: true });

  if (error || !attendances) {
    console.error('Error fetching attendances for time calculation:', error);
    return 0;
  }

  let totalSeconds = 0;
  let inTime: Date | null = null;

  for (const attendance of attendances) {
    if (attendance.type === 'in') {
      inTime = new Date(attendance.timestamp);
    } else if (attendance.type === 'out' && inTime) {
      const outTime = new Date(attendance.timestamp);
      totalSeconds += differenceInSeconds(outTime, inTime);
      inTime = null; 
    }
  }

  return totalSeconds / 3600; // Convert seconds to hours
}

// Admin actions
export async function getAllUsersWithStatus() {
    const supabase = createSupabaseAdminClient();
    const { data: users, error: usersError } = await supabase
        .from('users_with_latest_attendance')
        .select('*');

    if (usersError) {
        console.error('Error fetching users with status:', usersError);
        return { data: [], error: usersError };
    }
    return { data: users, error: null };
}

export async function getAllTeams() {
    const supabase = createSupabaseAdminClient();
    return supabase.schema('member').from('teams').select('*').order('name');
}

export async function getTeamsWithMemberStatus() {
    const supabase = createSupabaseAdminClient();
    const { data: teams, error: teamsError } = await supabase.schema('member').from('teams').select('id, name').order('name');
    if (teamsError) return [];

    const { data: users, error: usersError } = await supabase.schema('member').from('member_team_relations').select('member_id, team_id');
    if (usersError) return teams.map(t => ({ ...t, current: 0, total: 0 }));
    
    const userIds = users.map(u => u.member_id);

    // This is not efficient, but get_currently_in_user_ids is gone.
    // Let's get latest attendance for all users.
    const { data: latestAttendances, error: attendanceError } = await supabase
        .rpc('get_latest_attendance_for_users', { user_ids: userIds });

    const statusMap = new Map<string, string>();
    if (latestAttendances) {
        (latestAttendances as any[]).forEach(att => {
            statusMap.set(att.user_id, att.type);
        });
    }

    const memberStatusByTeam = users.reduce((acc, user) => {
        if (!user.team_id) return acc;
        if (!acc[user.team_id]) {
            acc[user.team_id] = { current: 0, total: 0 };
        }
        acc[user.team_id].total++;
        if (statusMap.get(user.member_id) === 'in') {
            acc[user.team_id].current++;
        }
        return acc;
    }, {} as Record<number, { current: number; total: number }>);

    return teams.map(team => ({
        ...team,
        ...memberStatusByTeam[team.id] || { current: 0, total: 0 },
    }));
}


export async function updateUser(userId: string, data: Partial<MemberUser & { card_id: string; team_id: number }>) {
    const supabase = createSupabaseAdminClient();
    const { card_id, team_id, ...memberData } = data;

    if (Object.keys(memberData).length > 0) {
        const { error: memberError } = await supabase.schema('member').from('users').update(memberData).eq('id', userId);
        if(memberError) return { success: false, message: memberError.message };
    }
    
    if (card_id) {
        const normalizedCardId = card_id.replace(/:/g, '').toLowerCase();
        const { error: cardError } = await supabase.schema('attendance').from('users').update({ card_id: normalizedCardId }).eq('id', userId);
        if(cardError) return { success: false, message: cardError.message };
    }
    
    if (team_id) {
         const { error: teamError } = await supabase.schema('member').from('member_team_relations').update({ team_id }).eq('member_id', userId);
         if(teamError) {
             const { error: insertError } = await supabase.schema('member').from('member_team_relations').insert({ member_id: userId, team_id });
             if (insertError) {
                return { success: false, message: `Failed to update or insert team relation: ${teamError.message} & ${insertError.message}` };
             }
         }
    }
    
    revalidatePath('/admin');
    return { success: true, message: 'ユーザー情報を更新しました。' };
}

export async function createTeam(name: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').insert({ name });
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を作成しました。'};
}

export async function updateTeam(id: number, name: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.schema('member').from('teams').update({ name }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を更新しました。'};
}

export async function deleteTeam(id: number) {
    const supabase = createSupabaseAdminClient();
    const { count } = await supabase.schema('member').from('member_team_relations').select('*', { count: 'exact' }).eq('team_id', id);

    if (count && count > 0) {
        return { success: false, message: `この班には${count}人のユーザーが所属しているため、削除できません。` };
    }

    const { error } = await supabase.schema('member').from('teams').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/dashboard', 'layout');
    return { success: true, message: '班を削除しました。' };
}

export async function forceLogoutAll() {
    const supabase = createSupabaseAdminClient();
    
    const { data: currentlyIn, error: currentlyInError } = await supabase
        .rpc('get_currently_in_user_ids');

    if (currentlyInError) {
        console.error('Error fetching currently in users:', currentlyInError);
        return { success: false, message: `DBエラー: ${currentlyInError.message}` };
    }
    
    const usersToLogOut = currentlyIn as string[];

    if (usersToLogOut.length === 0) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'success' });
        return { success: true, message: '現在活動中のユーザーはいません。', count: 0 };
    }

    const attendanceRecords = usersToLogOut.map((userId: string) => ({ user_id: userId, type: 'out' as const }));
    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert(attendanceRecords);

    if (insertError) {
        await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: 0, status: 'error' });
        return { success: false, message: insertError.message };
    }

    await supabase.schema('attendance').from('daily_logout_logs').insert({ affected_count: usersToLogOut.length, status: 'success' });

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    return { success: true, message: `${usersToLogOut.length}人のユーザーを強制退勤させました。`, count: usersToLogOut.length };
}

export async function forceToggleAttendance(userId: string) {
    const supabase = createSupabaseAdminClient();

    const { data: lastAttendance, error: lastAttendanceError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('type')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .maybeSingle();
    
    if(lastAttendanceError && lastAttendanceError.code !== 'PGRST116') { // Not an error if no rows found
        return { success: false, message: lastAttendanceError.message };
    }

    const newType = lastAttendance?.type === 'in' ? 'out' : 'in';

    const { error: insertError } = await supabase.schema('attendance').from('attendances').insert({ user_id: userId, type: newType });
    if(insertError) {
        return { success: false, message: insertError.message };
    }

    revalidatePath('/admin');
    revalidatePath('/dashboard/teams', 'page');
    revalidatePath('/dashboard/layout');
    return { success: true, message: `ユーザーを強制的に${newType === 'in' ? '出勤' : '退勤'}させました。` };
}

export async function getTeamWithMembersStatus(teamId: number) {
    const supabase = createSupabaseAdminClient();
    const { data: { user } } = await createSupabaseServerClient().auth.getUser();
    if (!user) return { team: null, members: [], stats: null, error: 'Not authenticated' };
    
    const { data: profile } = await supabase.schema('member').from('users').select('is_admin, member_team_relations!inner(team_id)').eq('id', user.id).single();

    if (!profile?.is_admin && !profile?.member_team_relations.some(rel => rel.team_id === teamId)) {
        return { team: null, members: [], stats: null, error: 'Access denied' };
    }

    const { data: team, error: teamError } = await supabase.schema('member').from('teams').select('*').eq('id', teamId).single();
    if(teamError || !team) return { team: null, members: [], stats: null, error: teamError?.message };

    const { data, error: membersError } = await supabase
        .from('users_with_latest_attendance_and_team')
        .select(`
            id,
            display_name,
            generation,
            status,
            latest_timestamp
        `)
        .eq('team_id', teamId);
    
    if (membersError || !data) {
        console.error("Error fetching team members with status:", membersError);
        return { team, members: [], stats: null, error: membersError?.message || 'Failed to fetch members' };
    }

    const members = (data as any[]).map(m => ({
        id: m.id,
        display_name: m.display_name,
        generation: m.generation,
        status: m.status || 'out',
        timestamp: m.latest_timestamp || null,
    }));
    
    const stats = await getTeamStats(teamId);

    return { team, members: members.sort((a,b) => b.generation - a.generation || a.display_name.localeCompare(b.display_name)), stats: stats, error: null };
}


async function getTeamStats(teamId: number) {
    const supabase = createSupabaseAdminClient();
    const today = new Date();

    const { count: totalMembersCount, error: totalMembersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

    if (totalMembersError) return null;
    
    const { data: teamMemberIds } = await supabase.schema('member').from('member_team_relations').select('member_id').eq('team_id', teamId);
    const memberIds = teamMemberIds?.map(m => m.member_id) || [];

    const { data: todayAttendanceData, error: todayAttendanceError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('user_id', { count: 'exact' })
        .eq('type', 'in')
        .gte('timestamp', startOfDay(today).toISOString())
        .lte('timestamp', endOfDay(today).toISOString())
        .in('user_id', memberIds);
    
    const uniqueTodayAttendees = todayAttendanceData ? new Set(todayAttendanceData.map(d => d.user_id)).size : 0;
    
    const attendanceRate = totalMembersCount ? (uniqueTodayAttendees / totalMembersCount) * 100 : 0;

    const avgAttendance = await getMonthlyTeamAttendanceStats(teamId, 30);
    
    return {
        totalMembers: totalMembersCount || 0,
        todayAttendees: uniqueTodayAttendees,
        todayAttendanceRate: attendanceRate,
        averageAttendanceRate30d: avgAttendance,
    };
}


export async function getMonthlyTeamAttendanceStats(teamId: number, days: number): Promise<number> {
    const supabase = createSupabaseAdminClient();
    const { data: teamMembers, error: teamMembersError } = await supabase
        .schema('member')
        .from('member_team_relations')
        .select('member_id')
        .eq('team_id', teamId);

    if (teamMembersError || !teamMembers || teamMembers.length === 0) return 0;
    
    const memberIds = teamMembers.map(m => m.member_id);

    const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
    const endDate = format(new Date(), 'yyyy-MM-dd');

    const { data: activityDays, error: activityDaysError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date', { count: 'exact' })
        .gte('date', startDate)
        .lte('date', endDate);

    const totalActivityDays = new Set(activityDays?.map(d => d.date)).size;
    if (totalActivityDays === 0) return 0;

    const { data: teamAttendances, error: teamAttendancesError } = await supabase
        .schema('attendance')
        .from('attendances')
        .select('date, user_id')
        .in('user_id', memberIds)
        .eq('type', 'in')
        .gte('date', startDate)
        .lte('date', endDate);

    if (teamAttendancesError) return 0;

    const dailyAttendanceCount = teamAttendances.reduce((acc, curr) => {
        if (!acc[curr.date]) {
            acc[curr.date] = new Set();
        }
        acc[curr.date].add(curr.user_id);
        return acc;
    }, {} as Record<string, Set<string>>);
    
    const dailyRates = Object.values(dailyAttendanceCount).map(users => (users.size / memberIds.length) * 100);
    const averageRate = dailyRates.length > 0 ? dailyRates.reduce((sum, rate) => sum + rate, 0) / dailyRates.length : 0;

    return averageRate;
}


export async function getAllAnnouncements() {
    const supabase = createSupabaseAdminClient();
    return supabase.schema('attendance').from('announcements').select('*, author:author_id(display_name)').order('created_at', { ascending: false });
}

export async function createAnnouncement(data: TablesInsert<'attendance', 'announcements'>) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.schema('attendance').from('announcements').insert(data);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'お知らせを作成しました。'};
}

export async function updateAnnouncement(id: string, data: TablesUpdate<'attendance', 'announcements'>) {
    const supabase = createSupabaseAdminClient();
    if(data.is_current) {
        await supabase.schema('attendance').from('announcements').update({ is_current: false }).eq('is_current', true);
    }
    const { error } = await supabase.schema('attendance').from('announcements').update(data).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    revalidatePath('/');
    return { success: true, message: 'お知らせを更新しました。'};
}

export async function deleteAnnouncement(id: string) {
    const supabase = createSupabaseAdminClient();
    // This is a soft delete
    const { error } = await supabase.schema('attendance').from('announcements').update({ is_active: false }).eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: 'お知らせを削除しました。' };
}

export async function logUserEdit(logData: TablesInsert<'attendance', 'user_edit_logs'>) {
    const supabase = createSupabaseAdminClient();
    await supabase.schema('attendance').from('user_edit_logs').insert(logData);
}

export async function getAllUserEditLogs() {
    const supabase = createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('user_edit_logs')
        .select('*, editor:editor_user_id(display_name), target:target_user_id(display_name)')
        .order('created_at', { ascending: false });
}

export async function getAllDailyLogoutLogs() {
    const supabase = createSupabaseAdminClient();
    return supabase
        .schema('attendance')
        .from('daily_logout_logs')
        .select('*')
        .order('executed_at', { ascending: false });
}

export async function getTempRegistrations() {
    const supabase = createSupabaseAdminClient();
    return supabase.schema('attendance').from('temp_registrations').select('*').order('created_at', { ascending: false });
}

export async function deleteTempRegistration(id: string) {
    const supabase = createSupabaseAdminClient();
    const { error } = await supabase.schema('attendance').from('temp_registrations').delete().eq('id', id);
    if(error) return { success: false, message: error.message };
    revalidatePath('/admin');
    return { success: true, message: '仮登録を削除しました。' };
}

export async function updateAllUserDisplayNames(): Promise<{ success: boolean, message: string, count: number }> {
    const supabase = createSupabaseAdminClient();

    const { data: users, error: usersError } = await supabase
        .schema('member')
        .from('users')
        .select('id, discord_id')
        .not('discord_id', 'eq', 'anonymous_admin');

    if (usersError) {
        return { success: false, message: `ユーザーの取得に失敗しました: ${usersError.message}`, count: 0 };
    }

    const allNames = await fetchAllMemberNames();
    if (!allNames) {
        return { success: false, message: 'APIからの名前リストの取得に失敗しました。', count: 0 };
    }

    const nameMap = new Map<string, string>(allNames.map(item => [item.uid, item.name]));
    let updatedCount = 0;
    const errors: string[] = [];

    for (const user of users) {
        const newName = nameMap.get(user.discord_id);
        if (newName) {
            const { error: updateError } = await supabase
                .schema('member')
                .from('users')
                .update({ display_name: newName })
                .eq('id', user.id);

            if (updateError) {
                errors.push(`ID ${user.id} の更新に失敗: ${updateError.message}`);
            } else {
                updatedCount++;
            }
        }
    }

    if (errors.length > 0) {
        return { success: false, message: `いくつかの更新に失敗しました: ${errors.join(', ')}`, count: updatedCount };
    }

    revalidatePath('/admin/users');
    revalidatePath('/dashboard');
    return { success: true, message: `${updatedCount}人のユーザー表示名を正常に更新しました。`, count: updatedCount };
}
