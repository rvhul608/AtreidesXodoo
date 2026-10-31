import type { Role } from './types';

export function homeForRole(role: Role): string {
  return role === 'customer' ? '/portal' : '/';
}

export function invoicePath(role: Role, id: number): string {
  return role === 'customer' ? `/portal/invoices/${id}` : `/invoices/${id}`;
}

export function ticketsPath(role: Role): string {
  return role === 'customer' ? '/portal' : '/tickets';
}
