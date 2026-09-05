import { Router } from 'express';
import { container } from 'tsyringe';

import { AuthController } from '../controllers/authController';

const authRouter = Router();
const authController = container.resolve(AuthController);

authRouter.post('/login', authController.login.bind(authController));
authRouter.post('/refresh', authController.refresh.bind(authController));
authRouter.post('/logout', authController.logout.bind(authController));
authRouter.get('/me', authController.me.bind(authController));
authRouter.post('/forgot-password', authController.forgotPassword.bind(authController));
authRouter.post('/reset-password-confirm', authController.resetPasswordConfirm.bind(authController));

export default authRouter;
