# Déploiement d'Event Prest'Art (gratuit)

| Élément | Hébergeur | Dépôt GitHub |
|---|---|---|
| Base PostgreSQL | **Neon** (free) | — |
| API NestJS | **Render** (free, Docker) | `Evenprestart-Api` |
| Front Next.js | **Vercel** (Hobby) | `Evenprestart-Web` |
| Images / emails | Cloudinary / Brevo (déjà en place) | — |

## Mise à jour automatique

```
git push (branche master)
 ├─ Evenprestart-Api → GitHub Actions (build + image Docker)
 │                     └─ si vert → Render redéploie l'API
 │                                  (migrations Prisma appliquées au démarrage)
 └─ Evenprestart-Web → Vercel build + déploie le front
                       (GitHub Actions vérifie le build en parallèle)
```

Rien d'autre à faire : un `git push` suffit. Si l'API ne compile pas, Render
garde l'ancienne version en ligne ; si le front ne compile pas, Vercel aussi.

---

## Mise en place (une seule fois)

### 1. Neon — base de données
1. https://neon.tech → *Sign up* → créer un projet (région **Frankfurt**).
2. *Connection string* → désactiver **Connection pooling** (Prisma a besoin de
   la connexion directe pour les migrations) → copier l'URL. Elle ressemble à :
   `postgresql://user:motdepasse@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require`
3. Charger les données de démo depuis ta machine (dossier `api`) :
   ```powershell
   $env:DATABASE_URL="<URL Neon>"; npx prisma migrate deploy; npm run prisma:seed
   ```

### 2. Render — API
1. https://render.com → *Sign up with GitHub*.
2. **New → Blueprint** → choisir `Evenprestart-Api` → Render lit `render.yaml`.
3. Remplir les variables demandées (tableau ci-dessous). Pour `CORS_ORIGIN` et
   `APP_WEB_URL`, mettre provisoirement `https://example.com` : on les corrige à
   l'étape 4, une fois l'adresse Vercel connue.
4. Attendre le premier déploiement → noter l'URL, ex. `https://eventprestart-api.onrender.com`.
   Vérifier : `https://eventprestart-api.onrender.com/api/health` → `Hello World!`

### 3. Vercel — front
1. https://vercel.com → *Sign up with GitHub* → **Add New → Project** → `Evenprestart-Web`.
2. *Environment Variables* :
   | Variable | Valeur |
   |---|---|
   | `NEXT_PUBLIC_API_URL` | URL Render, ex. `https://eventprestart-api.onrender.com` |
   | `GOOGLE_CLIENT_ID` | le même Client ID Google que l'API |
3. *Deploy* → noter l'URL, ex. `https://evenprestart-web.vercel.app`.

### 4. Relier les deux
1. Render → service → *Environment* : `CORS_ORIGIN` et `APP_WEB_URL` = URL Vercel
   (sans `/` final) → *Save* (redéploie).
2. Google Cloud Console → *Identifiants* → ton ID client OAuth → ajouter l'URI de
   redirection : `https://<url-vercel>/auth/google/callback`.
3. Tester : inscription, connexion Google, réservation, chat support.

### 5. Garder l'API réveillée (recommandé avant une démo)
Le plan gratuit de Render met l'API en veille après ~15 min sans visite (réveil
≈ 30–60 s). Gratuit : https://uptimerobot.com → *New monitor* → HTTP(s) →
`https://<url-render>/api/health` toutes les 10 min.

---

## Variables de l'API (Render)

| Variable | Valeur | Où la trouver |
|---|---|---|
| `DATABASE_URL` | URL Neon **directe** avec `?sslmode=require` | Neon → Connection string |
| `CORS_ORIGIN` | URL Vercel | Vercel |
| `APP_WEB_URL` | URL Vercel | Vercel |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | comme dans `api/.env` | Google Cloud Console |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | comme dans `api/.env` | Cloudinary |
| `BREVO_API_KEY`, `MAIL_FROM`, `MAIL_FROM_NAME` | comme dans `api/.env` | Brevo |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | **générés automatiquement** par Render | — |

Les paiements (Wave, Orange Money, Stripe) ne sont pas configurés : ils restent
en mode démo.
