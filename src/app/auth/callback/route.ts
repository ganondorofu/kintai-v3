
'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { fetchMemberStatus } from '@/lib/member-status-api';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const errorParam = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');
  
  // Cookieから登録ページのパスを取得（もしあれば）
  const cookieStore = await cookies();
  const authNext = cookieStore.get('auth_next')?.value;
  const next = authNext || searchParams.get('next') || '/dashboard';
  
  // 使用済みCookieを削除
  if (authNext) {
    cookieStore.delete('auth_next');
  }

  console.log('[AUTH CALLBACK] ========================================');
  console.log('[AUTH CALLBACK] Timestamp:', new Date().toISOString());
  console.log('[AUTH CALLBACK] Code present:', !!code);
  console.log('[AUTH CALLBACK] Error param:', errorParam ? 'yes' : 'no');

  // OAuthプロバイダーからのエラーをチェック
  if (errorParam) {
    console.error('[AUTH CALLBACK] OAuth error from provider:', errorParam);
    
    // ユーザーに分かりやすいエラーメッセージを表示
    let userMessage = '認証中にエラーが発生しました。';
    if (errorDescription?.includes('Unable to exchange external code')) {
      userMessage = '認証の処理中にエラーが発生しました。時間をおいて再度お試しください。改善しない場合は管理者にお問い合わせください。';
    } else if (errorDescription) {
      userMessage = errorDescription;
    }
    
    return NextResponse.redirect(`${origin}/login?error=${encodeURIComponent(userMessage)}`);
  }

  if (!code) {
    console.error('[AUTH CALLBACK] No code parameter in callback URL');
    return NextResponse.redirect(`${origin}/login?error=認証コードが見つかりません。`);
  }

  const supabase = await createSupabaseServerClient();
  
  // PKCEフローでコードをセッションに交換
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[AUTH CALLBACK] Code exchange failed:', error.code);
    
    // PKCEエラーの場合は再ログインを促す
    if (error.message.includes('flow state')) {
      return NextResponse.redirect(`${origin}/login?error=セッションの有効期限が切れました。もう一度ログインしてください。`);
    }
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました: ${error.message}`);
  }

  if (!data.session || !data.user) {
    console.error('[AUTH CALLBACK] No session or user in response');
    return NextResponse.redirect(`${origin}/login?error=セッションの確立に失敗しました。`);
  }

  const discordUid = data.user.user_metadata.provider_id;
  
  if (!discordUid) {
      console.error('[AUTH CALLBACK] Discord UID not found in user metadata');
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=DiscordユーザーIDが取得できませんでした。`);
  }

  // Discord サーバー所属チェック
  const { data: memberStatus, error: apiError } = await fetchMemberStatus(discordUid);

  if (apiError) {
      console.error('[AUTH CALLBACK] Error fetching member status from API');
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=APIとの通信中にエラーが発生しました。しばらく待ってから再度お試しください。`);
  }

  if (!memberStatus || !memberStatus.is_in_server) {
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
  }

  // member.members テーブルにユーザーが登録されているかチェック
  const { data: memberRecord, error: memberError } = await supabase
    .schema('member')
    .from('members')
    .select('supabase_auth_user_id')
    .eq('discord_uid', discordUid)
    .single();

  if (memberError) {
    console.error('[AUTH CALLBACK] Member lookup error:', memberError.code);
  }

  if (memberError || !memberRecord) {
      console.log('[AUTH CALLBACK] User not found in member.members table');
      await supabase.auth.signOut();
      return NextResponse.redirect(`${origin}/login?error=not_registered`);
  }

  console.log('[AUTH CALLBACK] Authentication successful');
  console.log('[AUTH CALLBACK] ========================================');

  return NextResponse.redirect(`${origin}${next}`);
}
