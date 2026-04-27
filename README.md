# Administrador de Cuentas

App web para administrar:

- Cuentas a pagar.
- Ingresos propios del mes.
- Plata que te deben otras personas.
- Gastos de tarjeta (incluye cuota).

Incluye:

- Login con Supabase Auth (email + contrasena).
- Resumen mensual con saldo proyectado.
- Alta, listado, marcado como hecho/pendiente y eliminacion de movimientos.
- Diseno responsive para celular y PC.

## 1) Crear proyecto Supabase

1. Crea un proyecto en Supabase.
2. En SQL Editor, pega y ejecuta [supabase/schema.sql](supabase/schema.sql).
3. En Authentication:
	- Habilita Email/Password.
	- Opcional: desactiva "Confirm email" si quieres entrar inmediatamente al registrarte.

## 2) Variables de entorno

1. Copia `.env.example` a `.env`.
2. Completa:

```env
VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
VITE_SUPABASE_ANON_KEY=tu-anon-key
```

## 3) Ejecutar localmente

```bash
npm install
npm run dev
```

## 4) Deploy en Vercel

1. Sube este repo a GitHub.
2. Importa el repo en Vercel.
3. En `Project Settings > Environment Variables` agrega:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
4. Deploy.

Listo, tendras la app online para consultarla desde el telefono.

## Estructura principal

- `src/App.jsx`: UI principal, auth y CRUD de movimientos.
- `src/lib/supabase.js`: cliente Supabase.
- `supabase/schema.sql`: tabla y politicas RLS.
- `.env.example`: plantilla de variables.
