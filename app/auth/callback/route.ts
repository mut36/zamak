import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '../../lib/supabase/server';

/**
 * Where Google sends the user back after consent. Exchanges the one-time code
 * for a session cookie, then returns them to the app.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');

  if (error) {
    return NextResponse.redirect(`${origin}/?auth_error=${encodeURIComponent(error)}`);
  }

  if (!code) {
    return NextResponse.redirect(`${origin}/?auth_error=missing_code`);
  }

  const supabase = await createClient();
  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);

  if (exchangeError) {
    return NextResponse.redirect(
      `${origin}/?auth_error=${encodeURIComponent(exchangeError.message)}`,
    );
  }

  return NextResponse.redirect(origin);
}
