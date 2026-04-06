import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Verify that the current user is authenticated and return their info.
 * Returns null if not authenticated.
 */
export async function getCurrentUser() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Verify that the current user is an admin.
 * Returns { isAdmin: true, userId: string } or { isAdmin: false, userId?: string }.
 */
export async function requireAdmin(): Promise<{ isAdmin: boolean; userId: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { isAdmin: false, userId: null };
  }

  const { data: profile } = await supabase
    .schema('member')
    .from('members')
    .select('is_admin')
    .eq('supabase_auth_user_id', user.id)
    .single();

  return {
    isAdmin: profile?.is_admin === true,
    userId: user.id,
  };
}

/**
 * Verify that the current user is authenticated and return their userId.
 * Returns null if not authenticated.
 */
export async function requireAuth(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.id ?? null;
}

/**
 * Simple in-memory rate limiter.
 * Returns true if the request should be allowed, false if rate-limited.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false;
  }

  entry.count++;
  return true;
}
