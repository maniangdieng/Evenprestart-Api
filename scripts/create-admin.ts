// Crée un compte SUPER_ADMIN — seul moyen d'obtenir le premier administrateur
// d'une base neuve, l'inscription publique n'autorisant que CLIENT et ARTIST.
//
// Usage : npm run admin:create -- <email> <mot-de-passe> [prénom] [nom]
// (sur Render : onglet « Shell » du service eventprestart-api)
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const MIN_PASSWORD_LENGTH = 12;

async function main() {
  const [email, password, firstName = 'Admin', lastName = "Event Prest'Art"] =
    process.argv.slice(2);

  if (!email || !password) {
    throw new Error(
      'Usage : npm run admin:create -- <email> <mot-de-passe> [prénom] [nom]',
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(
      `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`,
    );
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new Error(
        `Un compte existe déjà pour ${email} (rôle ${existing.role}). Changez son rôle depuis le Back-Office.`,
      );
    }

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 12),
        firstName,
        lastName,
        role: 'SUPER_ADMIN',
        isEmailVerified: true,
        isActive: true,
      },
    });
    console.log(`Super-admin créé : ${user.email} (${user.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
