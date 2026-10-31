import { AppError } from '../../common/errors.js';
import { hashPassword } from '../../common/password.js';
import { paginationMeta, paginationValues } from '../../common/pagination.js';
import { meetsPasswordRules, PASSWORD_RULES_MESSAGE } from '../../common/password-policy.js';
import { createStaffUser, deactivateUser, listUsers } from './repository.js';

function publicUser(user: Awaited<ReturnType<typeof createStaffUser>>) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    customer_id: user.customerId,
    role: user.role,
    is_active: user.isActive,
    created_at: user.createdAt,
  };
}

export async function createStaff(input: {
  email: string;
  password: string;
  name?: string;
  actorId: number;
}) {
  if (!meetsPasswordRules(input.password)) {
    throw new AppError(400, 'PASSWORD_POLICY', PASSWORD_RULES_MESSAGE);
  }
  const user = await createStaffUser({
    email: input.email.trim().toLowerCase(),
    name: input.name?.trim() || null,
    passwordHash: await hashPassword(input.password),
    actorId: input.actorId,
  });
  return publicUser(user);
}

export async function getUsers(page: number, pageSize: number) {
  const { limit, offset } = paginationValues({ page, pageSize });
  const result = await listUsers(limit, offset);
  return {
    data: result.users.map(publicUser),
    meta: paginationMeta(page, pageSize, result.total),
  };
}

export async function deactivate(actorId: number, userId: number) {
  if (actorId === userId) {
    throw new AppError(409, 'SELF_DEACTIVATION', 'You cannot deactivate your own account');
  }
  const user = await deactivateUser(userId, actorId);
  if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found');
  return publicUser(user);
}
