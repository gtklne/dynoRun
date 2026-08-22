import { createAuthClient } from 'better-auth/react';
import { oneTimeTokenClient } from 'better-auth/client/plugins';
import { getNativeToken, setNativeToken } from './native-token';

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL ?? '',
  plugins: [oneTimeTokenClient()],
  fetchOptions: {
    // No-ops on web, where the session is an HttpOnly cookie and getNativeToken
    // always returns null. See native-token.ts for why native needs a bearer.
    auth: {
      type: 'Bearer',
      token: () => getNativeToken() ?? '',
    },
    onSuccess: (ctx) => {
      const token = ctx.response.headers.get('set-auth-token');
      if (token) setNativeToken(token);
    },
  },
});
