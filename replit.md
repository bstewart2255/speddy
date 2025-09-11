# Overview

Speddy is a comprehensive special education platform built with Next.js and Supabase that helps special education providers manage schedules, students, and generate AI-powered lesson plans. The application serves teachers, speech therapists, occupational therapists, and other special education professionals with tools for student management, scheduling optimization, and curriculum support.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture

The application uses Next.js 14 with the App Router pattern and TypeScript for type safety. The UI is built with custom React components using Tailwind CSS for styling, featuring a dashboard-style interface with role-based navigation. Key architectural patterns include:

- **Component Structure**: Organized in `/app/components/` with feature-specific subdirectories
- **Layout System**: Nested layouts for authentication and dashboard areas
- **State Management**: React hooks and context providers (notably `SchoolProvider` for school context)
- **Performance Optimizations**: Uses React's `useMemo` and `useCallback` for expensive operations

## Backend Architecture

The backend leverages Supabase as a Backend-as-a-Service solution providing:

- **Authentication**: Supabase Auth with Row Level Security (RLS) policies
- **Database**: PostgreSQL with comprehensive schema for education data
- **API Routes**: Next.js API routes for custom business logic and integrations
- **Real-time Features**: Supabase real-time subscriptions for live updates

## Database Design

The system uses a structured, ID-based approach with NCES (National Center for Education Statistics) data:

- **User Management**: `profiles` table with role-based permissions and school associations
- **Educational Hierarchy**: `states` → `districts` → `schools` with proper foreign key relationships
- **Scheduling System**: Complex schema supporting sessions, bell schedules, and special activities
- **Lesson Management**: Unified `lessons` table replacing multiple legacy tables
- **Analytics**: Event tracking with `analytics_events` table

## Authentication & Authorization

Implements a multi-layered security approach:

- **Supabase Authentication**: Email/password with role-based access control
- **Row Level Security**: Database-level policies ensuring users only access their data
- **Middleware Protection**: Next.js middleware validates sessions and enforces route protection
- **Role-Based UI**: Different interfaces for teachers, SEAs, and administrators

## AI Integration

The platform integrates with multiple AI providers for lesson generation:

- **Anthropic Claude**: Primary AI provider for lesson content generation
- **OpenAI**: Alternative provider with fallback capabilities
- **Structured Prompts**: Enhanced prompt system ensuring consistent worksheet formatting
- **Content Validation**: Multi-step validation of AI-generated educational content

## Scheduling Engine

Features a sophisticated scheduling optimization system:

- **Constraint-Based Scheduling**: Respects work locations, bell schedules, and special activities
- **Multi-Pass Distribution**: Two-pass algorithm for optimal session distribution
- **Drag-and-Drop Interface**: Real-time conflict detection with visual feedback
- **Grade-Level Grouping**: Intelligent grouping of students by grade level

## Performance & Monitoring

Implements comprehensive performance monitoring:

- **Sentry Integration**: Error tracking and performance monitoring
- **Custom Analytics**: Event tracking for user interactions and system performance
- **Database Optimization**: Proper indexing and query optimization
- **Caching Strategies**: Memoization and efficient data fetching patterns

# External Dependencies

## Core Infrastructure

- **Supabase**: Primary backend service providing PostgreSQL database, authentication, real-time subscriptions, and file storage
- **Vercel/Replit**: Application hosting and deployment platform
- **Sentry**: Error monitoring and performance tracking service

## AI & Content Generation

- **Anthropic Claude API**: Primary AI service for generating educational content and lesson plans
- **OpenAI API**: Secondary AI provider for content generation with fallback capabilities

## UI & Functionality

- **Playwright**: End-to-end testing framework for automated testing
- **Stripe**: Payment processing for subscription management
- **Resend**: Email service for transactional emails and notifications

## Development Tools

- **TypeScript**: Type safety and enhanced developer experience
- **Tailwind CSS**: Utility-first CSS framework for consistent styling
- **React Hook Form**: Form handling with validation
- **Zod**: Runtime type validation and schema validation

## File Processing

- **jsPDF**: PDF generation for worksheets and reports
- **ExcelJS**: Spreadsheet processing for data import/export
- **Mammoth**: Word document processing for content import
- **Papa Parse**: CSV parsing for bulk data operations

## Specialized Libraries

- **date-fns**: Date manipulation and formatting
- **QR Code Generation**: Custom QR code system for worksheet uploads
- **DOMPurify**: HTML sanitization for security
- **Recharts**: Data visualization and analytics charts