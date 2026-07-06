import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt              from "bcryptjs";
import prisma              from "@/lib/prisma";
import { Rol }             from "@/generated/prisma/enums";

declare module "next-auth" {
  interface Session {
    user: {
      id:        string;
      email:     string;
      nombre:    string;
      rol:       Rol;
      empresaId: string | null;
      localId:   string | null;
    };
  }
  interface User {
    id:        string;
    email:     string;
    nombre:    string;
    rol:       Rol;
    empresaId: string | null;
    localId:   string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id:        string;
    nombre:    string;
    rol:       Rol;
    empresaId: string | null;
    localId:   string | null;
  }
}

async function registrarLogin(opts: {
  email: string;
  ip: string;
  userAgent?: string;
  exitoso: boolean;
  usuarioId?: string;
}) {
  try {
    await prisma.loginLog.create({
      data: {
        email:     opts.email,
        ip:        opts.ip,
        userAgent: opts.userAgent ?? null,
        exitoso:   opts.exitoso,
        usuarioId: opts.usuarioId ?? null,
      },
    });
  } catch {
    // nunca bloquear el login por un error de log
  }
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        email:    { label: "Email",      type: "email"    },
        password: { label: "Contraseña", type: "password" },
      },
      async authorize(credentials, req) {
        const ip = (req?.headers?.["x-forwarded-for"] as string)?.split(",")[0]?.trim()
          ?? (req?.headers?.["x-real-ip"] as string)
          ?? "127.0.0.1";
        const ua = req?.headers?.["user-agent"] as string | undefined;

        if (!credentials?.email || !credentials?.password) return null;

        const email = credentials.email.toLowerCase().trim();

        const usuario = await prisma.usuario.findUnique({
          where:  { email },
          select: { id: true, email: true, nombre: true, rol: true,
                    empresaId: true, localId: true, password: true, activo: true },
        });

        if (!usuario || !usuario.activo) {
          await registrarLogin({ email, ip, userAgent: ua, exitoso: false });
          return null;
        }

        const ok = await bcrypt.compare(credentials.password, usuario.password);
        if (!ok) {
          await registrarLogin({ email, ip, userAgent: ua, exitoso: false });
          return null;
        }

        await registrarLogin({ email, ip, userAgent: ua, exitoso: true, usuarioId: usuario.id });

        return {
          id:        usuario.id,
          email:     usuario.email,
          nombre:    usuario.nombre,
          rol:       usuario.rol,
          empresaId: usuario.empresaId,
          localId:   usuario.localId,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id        = user.id;
        token.nombre    = user.nombre;
        token.rol       = user.rol;
        token.empresaId = user.empresaId;
        token.localId   = user.localId;
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id:        token.id,
        email:     token.email ?? "",
        nombre:    token.nombre,
        rol:       token.rol,
        empresaId: token.empresaId,
        localId:   token.localId,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
  secret: process.env.NEXTAUTH_SECRET,
};
