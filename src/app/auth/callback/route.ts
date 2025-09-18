'use server';
import { createSupabaseServerClient } from '@/lib/supabase/server'
import axios from 'axios';
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const origin = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && data.session) {
      const discordToken = data.session.provider_token;
      const requiredServerId = process.env.DISCORD_SERVER_ID;
      
      console.log('--- Discord Auth Callback Debug ---');

      if (!requiredServerId) {
        console.error('[DEBUG] DISCORD_SERVER_ID is not set in environment variables.');
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=サーバーの設定に問題があります。(管理者に連絡してください)`);
      }
      console.log(`[DEBUG] Required Discord Server ID: ${requiredServerId}`);


      if (discordToken) {
        try {
          const response = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
              'Authorization': `Bearer ${discordToken}`,
            },
          });
          
          const guilds = response.data;
          console.log('[DEBUG] Fetched guilds from Discord API:', JSON.stringify(guilds.map((g: any) => ({id: g.id, name: g.name})), null, 2));

          const isMember = guilds.some((guild: any) => guild.id === requiredServerId);
          console.log(`[DEBUG] Is user a member of the required server? ${isMember}`);

          if (isMember) {
            console.log('[DEBUG] User is a member. Redirecting to dashboard...');
            return NextResponse.redirect(`${origin}${next}`);
          } else {
            console.log('[DEBUG] User is NOT a member. Signing out and redirecting to login...');
            await supabase.auth.signOut();
            return NextResponse.redirect(`${origin}/login?error=指定されたDiscordサーバーのメンバーではありません。`);
          }
        } catch (e: any) {
          console.error('[DEBUG] Error communicating with Discord API:', e.response?.data || e.message);
          await supabase.auth.signOut();
          return NextResponse.redirect(`${origin}/login?error=Discordとの通信中にエラーが発生しました。`);
        }
      } else {
         console.error('[DEBUG] Discord provider_token not found in session.');
         await supabase.auth.signOut();
         return NextResponse.redirect(`${origin}/login?error=Discordの認証トークンが見つかりませんでした。権限スコープを再確認してください。`);
      }
    } else {
      console.error('[DEBUG] Supabase code exchange error:', error?.message);
    }
  }

  // Fallback for any other error cases
  console.log('[DEBUG] Fallback: Redirecting to login with generic error.');
  return NextResponse.redirect(`${origin}/login?error=ユーザーを認証できませんでした。`)
}
