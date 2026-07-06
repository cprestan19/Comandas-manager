import { Session } from "next-auth";
import { Rol }     from "@/generated/prisma/enums";

interface SessionUser {
  id:        string;
  rol:       Rol;
  empresaId: string | null;
  localId:   string | null;
}

export class AppError extends Error {
  constructor(
    message: string,
    public status: number = 500,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/**
 * Devuelve el empresaId del usuario autenticado.
 * SUPERADMIN no tiene empresa → lanza error (usa el panel de plataforma).
 */
export function getEffectiveEmpresaId(session: Session): string {
  const user = session.user as SessionUser;
  if (user.rol === Rol.SUPERADMIN) throw new AppError("SUPERADMIN opera a nivel de plataforma", 403);
  if (!user.empresaId) throw new AppError("Usuario sin empresa asignada", 403);
  return user.empresaId;
}

/**
 * Devuelve el localId del usuario autenticado.
 * Solo COCINA tiene localId asignado; ADMIN_LOCAL y SUPERADMIN no operan en cocina.
 */
export function getEffectiveLocalId(
  session: Session,
  overrideLocalId?: string | null,
): string {
  const user = session.user as SessionUser;

  if (user.rol === Rol.SUPERADMIN) {
    if (!overrideLocalId) throw new AppError("SUPERADMIN debe especificar localId", 400);
    return overrideLocalId;
  }

  if (user.rol === Rol.ADMIN_LOCAL) {
    if (!overrideLocalId) throw new AppError("El rol ADMIN no opera en cocina", 403);
    return overrideLocalId;
  }

  // COCINA
  if (!user.localId) throw new AppError("Usuario sin local asignado", 403);
  return user.localId;
}
