import { PrismaClient, BookingStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const CATEGORIES = [
  { slug: 'musique', name: 'Musique', icon: '🎤' },
  { slug: 'danse', name: 'Danse', icon: '💃' },
  { slug: 'dj', name: 'DJ', icon: '🎧' },
  { slug: 'son-lumiere', name: 'Son & Lumière', icon: '🔊' },
  { slug: 'animation', name: 'Animation', icon: '🎭' },
  { slug: 'photo-video', name: 'Photo / Vidéo', icon: '📸' },
];

const TALENTS = [
  {
    email: 'awa@example.com',
    stageName: 'Awa & The Groove',
    categorySlug: 'musique',
    location: 'Dakar',
    basePriceFrom: 450000,
    isVerified: true,
    ratingAverage: 4.9,
    ratingCount: 38,
    bio: "Groupe de 6 musiciens fusionnant l'afro-soul, le mbalax et le funk. Plus de 200 prestations en entreprise, mariages et festivals à Dakar, Saly et à l'international.",
    packages: [
      { name: 'Trio acoustique', description: '2h · 3 musiciens · idéal cocktail', price: 450000, isPopular: false },
      { name: 'Full band + son', description: '3h · 6 musiciens · sono incluse', price: 750000, isPopular: true },
    ],
  },
  {
    email: 'ismael@example.com',
    stageName: 'Ismaël Lô Jr.',
    categorySlug: 'musique',
    location: 'Dakar',
    basePriceFrom: 300000,
    isVerified: true,
    ratingAverage: 4.9,
    ratingCount: 38,
    bio: 'Chanteur mbalax, héritier des grandes voix sénégalaises. Répertoire traditionnel et créations originales.',
    packages: [{ name: 'Prestation solo', description: '2h · voix + guitare', price: 300000, isPopular: false }],
  },
  {
    email: 'djkaay@example.com',
    stageName: 'DJ Kaay',
    categorySlug: 'dj',
    location: 'Dakar',
    basePriceFrom: 220000,
    isVerified: true,
    ratingAverage: 5.0,
    ratingCount: 54,
    bio: 'DJ résident afro house, spécialiste des soirées club et corporate à Dakar.',
    packages: [{ name: 'Set 3h', description: 'Matériel son inclus', price: 220000, isPopular: false }],
  },
  {
    email: 'sunusono@example.com',
    stageName: 'SunuSono',
    categorySlug: 'son-lumiere',
    location: 'Dakar',
    basePriceFrom: 500000,
    isVerified: false,
    ratingAverage: 4.7,
    ratingCount: 63,
    bio: 'Prestataire technique son & lumière pour événements de toutes tailles.',
    packages: [{ name: 'Pack événement', description: 'Sonorisation + éclairage', price: 500000, isPopular: false }],
  },
  {
    email: 'korasabar@example.com',
    stageName: 'Kora & Sabar Trio',
    categorySlug: 'musique',
    location: 'Dakar',
    basePriceFrom: 260000,
    isVerified: false,
    ratingAverage: 4.7,
    ratingCount: 19,
    bio: 'Trio traditionnel kora et percussions sabar pour cérémonies et réceptions.',
    packages: [{ name: 'Prestation live', description: '2h · 3 musiciens', price: 260000, isPopular: false }],
  },
  {
    email: 'niofar@example.com',
    stageName: 'Nio Far Brass',
    categorySlug: 'musique',
    location: 'Dakar',
    basePriceFrom: 390000,
    isVerified: false,
    ratingAverage: 4.6,
    ratingCount: 12,
    bio: 'Fanfare afrobeat, cuivres et percussions pour cortèges et ouvertures de soirée.',
    packages: [{ name: 'Cortège + set', description: '1h30 · 8 musiciens', price: 390000, isPopular: false }],
  },
  {
    email: 'marema@example.com',
    stageName: 'Maréma',
    categorySlug: 'musique',
    location: 'Dakar',
    basePriceFrom: 340000,
    isVerified: true,
    ratingAverage: 4.8,
    ratingCount: 27,
    bio: 'Chanteuse pop-folk, compositions originales en wolof et en français.',
    packages: [{ name: 'Showcase', description: '1h · voix + guitare + choriste', price: 340000, isPopular: false }],
  },
];

async function main() {
  const alreadySeeded = await prisma.user.findUnique({
    where: { email: TALENTS[0].email },
  });
  if (alreadySeeded) {
    console.log('Seed déjà appliqué, rien à faire.');
    return;
  }

  const passwordHash = await bcrypt.hash('Password123!', 10);

  const categories = new Map<string, string>();
  for (const category of CATEGORIES) {
    const created = await prisma.category.upsert({
      where: { slug: category.slug },
      update: {},
      create: category,
    });
    categories.set(category.slug, created.id);
  }

  for (const talent of TALENTS) {
    const user = await prisma.user.create({
      data: {
        email: talent.email,
        passwordHash,
        firstName: talent.stageName.split(' ')[0],
        lastName: 'Artiste',
        role: 'ARTIST',
        isEmailVerified: true,
      },
    });

    await prisma.talentProfile.create({
      data: {
        userId: user.id,
        stageName: talent.stageName,
        bio: talent.bio,
        location: talent.location,
        basePriceFrom: talent.basePriceFrom,
        isVerified: talent.isVerified,
        isPublished: true,
        ratingAverage: talent.ratingAverage,
        ratingCount: talent.ratingCount,
        categories: {
          create: [{ categoryId: categories.get(talent.categorySlug)! }],
        },
        packages: { create: talent.packages },
      },
    });
  }

  const client = await prisma.user.create({
    data: {
      email: 'mariama@example.com',
      passwordHash,
      firstName: 'Mariama',
      lastName: 'D.',
      role: 'CLIENT',
      isEmailVerified: true,
    },
  });

  const awa = await prisma.talentProfile.findFirstOrThrow({
    where: { stageName: 'Awa & The Groove' },
    include: { packages: true },
  });
  const fullBandPackage = awa.packages.find((pkg) => pkg.isPopular)!;

  const booking = await prisma.booking.create({
    data: {
      clientId: client.id,
      talentProfileId: awa.id,
      servicePackageId: fullBandPackage.id,
      eventDate: new Date('2026-05-10'),
      location: 'Dakar',
      status: BookingStatus.COMPLETED,
      subtotalAmount: fullBandPackage.price,
      serviceFeeAmount: 37500,
      totalAmount: 787500,
      commissionRate: 10,
    },
  });

  await prisma.review.create({
    data: {
      bookingId: booking.id,
      authorId: client.id,
      talentProfileId: awa.id,
      rating: 5,
      comment: 'Ambiance incroyable, ponctuels et très professionnels.',
    },
  });

  console.log('Seed appliqué : catégories, talents et avis de démonstration créés.');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
