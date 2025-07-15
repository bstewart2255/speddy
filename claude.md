Based on your project setup with Replit, Node.js 22, and Supabase, here's a comprehensive `claude.md` file that will help Claude Code understand your project:

# Project Overview

This is a Next.js application running on Node.js 22 in Replit with Supabase as the database backend.

## Tech Stack
- **Runtime**: Node.js 22
- **Framework**: Next.js (React)
- **Database**: Supabase (PostgreSQL)
- **IDE**: Replit
- **Styling**: Tailwind CSS
- **Payment Processing**: Stripe

## Development Guidelines

### Code Style
- Use ES6+ JavaScript/TypeScript features
- Prefer functional components with hooks in React
- Use async/await for asynchronous operations
- Follow React best practices and conventions

### File Structure
- Components go in `/components`
- API routes go in `/app/api` or `/pages/api`
- Database queries and Supabase client code in `/lib/supabase`
- Utility functions in `/utils`

### Important Notes
- **Always provide complete code blocks** - include entire components/functions with proper opening and closing tags
- Match opening elements to closing ones (e.g., `<div>` with `</div>`)
- When modifying existing code, include enough context to identify where changes go
- Format code properly with consistent indentation

### Database
- Supabase is our PostgreSQL database
- Use Supabase client for all database operations
- Check for existing migrations in `/supabase/migrations`
- RLS (Row Level Security) policies should be considered for all tables

### Environment Variables
- All sensitive keys are stored in Replit Secrets
- Access them via `process.env.VARIABLE_NAME`
- Never commit sensitive information to the repository

### Common Commands
- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server

### Testing Approach
- Test in development mode first
- Use console.log for debugging
- Check browser console and network tab for errors
- Verify Supabase queries in the Supabase dashboard

### Specific Requirements
- Consider error handling and edge cases
- Follow TypeScript types when applicable
- Ensure proper imports at the top of files

### Payment System
- Stripe is integrated for payments
- Monthly subscription: $11.99
- 30-day free trial (60 days with referral)
- Test mode uses Stripe test keys
