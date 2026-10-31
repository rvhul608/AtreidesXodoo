import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../common/async-handler.js';
import { requireAuth } from '../../common/auth-middleware.js';
import { sessionCookieOptions } from '../../common/session.js';
import { validateBody } from '../../common/validate.js';
import { createRateLimiter } from '../../common/rate-limit.js';
import { meetsPasswordRules, PASSWORD_RULES_MESSAGE } from '../../common/password-policy.js';
import { currentUser, login, requestPasswordReset, resetPassword, signup } from './service.js';

const passwordSchema = z.string().refine(meetsPasswordRules, PASSWORD_RULES_MESSAGE);
const signupSchema = z.object({
  email: z.string().trim().email().max(254),
  password: passwordSchema,
  name: z.string().trim().min(1).max(120).optional(),
});
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(256) });
const forgotSchema = z.object({ email: z.string().trim().email().max(254) });
const resetSchema = z.object({ token: z.string().min(32).max(128), password: passwordSchema });

const router = Router();
const loginLimiter = createRateLimiter(10, 15 * 60 * 1000);
const resetLimiter = createRateLimiter(10, 15 * 60 * 1000);
const genericResetMessage = 'Reset link sent if account exists';

router.post('/signup', validateBody(signupSchema), asyncHandler(async (request, response) => {
  const result = await signup(request.body as z.infer<typeof signupSchema>);
  response.cookie('session', result.token, sessionCookieOptions());
  response.status(201).json({ data: result.user });
}));

router.post('/login', loginLimiter, validateBody(loginSchema), asyncHandler(async (request, response) => {
  const result = await login(request.body as z.infer<typeof loginSchema>);
  response.cookie('session', result.token, sessionCookieOptions());
  response.json({ data: result.user });
}));

router.post('/logout', (_request, response) => {
  const { maxAge: _maxAge, ...cookieOptions } = sessionCookieOptions();
  response.clearCookie('session', cookieOptions);
  response.json({ data: { message: 'Logged out' } });
});

router.get('/me', requireAuth, (request, response) => {
  response.json({ data: currentUser(request.auth!) });
});

const forgotHandler = [resetLimiter, validateBody(forgotSchema), asyncHandler(async (request, response) => {
  await requestPasswordReset((request.body as z.infer<typeof forgotSchema>).email);
  response.json({ data: { message: genericResetMessage } });
})];
router.post('/forgot-password', ...forgotHandler);
router.post('/request-reset', ...forgotHandler);

router.post('/reset-password', resetLimiter, validateBody(resetSchema), asyncHandler(async (request, response) => {
  await resetPassword(request.body as z.infer<typeof resetSchema>);
  response.json({ data: { message: 'Password reset successfully' } });
}));

export default router;
