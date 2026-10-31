export type UserRole = 'admin' | 'staff' | 'customer';

export interface AuthPrincipal {
  id: number;
  email: string;
  name: string | null;
  customerId: number | null;
  role: UserRole;
}
