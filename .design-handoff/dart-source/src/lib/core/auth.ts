import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

const ALLOWED_GOOGLE_DOMAIN = 'medicnc.co.kr';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ account, profile }) {
      if (account?.provider === 'google') {
        const email = profile?.email ?? '';
        if (!email.endsWith(`@${ALLOWED_GOOGLE_DOMAIN}`)) {
          return false;
        }
      }
      return true;
    },
    async jwt({ token, user, account, profile }) {
      if (user) {
        if (account?.provider === 'google') {
          const profileSub = (profile as { sub?: string } | undefined)?.sub;
          const profileEmail = (profile as { email?: string } | undefined)?.email;
          // Google 로그인은 세션 간 동일 식별자를 보장하도록 sub를 고정한다.
          token.sub = profileSub || profileEmail || token.sub;
          token.groupId = 'medicnc';
          token.groupName = '메디씨앤씨';
          token.email = profileEmail;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        session.user.groupId = token.groupId as string;
        session.user.groupName = token.groupName as string;
        if (token.email) {
          session.user.email = token.email as string;
        }
      }
      return session;
    },
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin',
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30일
  },
  trustHost: true,
});
