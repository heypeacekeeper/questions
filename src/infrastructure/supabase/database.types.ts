/**
 * Hand-maintained TypeScript types mirroring supabase/migrations/*.sql.
 * Regenerate with `supabase gen types typescript --linked > src/infrastructure/supabase/database.types.ts`
 * once the project exists, then keep the shape compatible with the mappers.
 *
 * ONLY the Supabase adapter may import this file.
 */

export type ContentStatus = 'draft' | 'published' | 'archived';
export type SubmissionStatusRow = 'pending' | 'approved' | 'rejected';

export type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  canonical_path: string;
  h1: string;
  seo_title: string;
  meta_description: string;
  introduction: string;
  short_description: string;
  icon: string;
  status: ContentStatus;
  nav_featured: boolean;
  include_in_mixed_game: boolean;
  requires_age_gate: boolean;
  is_child_safe: boolean;
  is_mature: boolean;
  seasonal_start: string | null;
  seasonal_end: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type QuestionRow = {
  display_vote_count: number;
  id: string;
  option_a: string;
  option_b: string;
  status: ContentStatus;
  share_code: string;
  sort_order: number;
  is_demo: boolean;
  created_at: string;
  updated_at: string;
  published_at: string | null;
}

export type QuestionCategoryRow = {
  question_id: string;
  category_id: string;
  created_at: string;
}

export type QuestionSubmissionRow = {
  id: string;
  option_a: string;
  option_b: string;
  category_id: string;
  submitter_name: string | null;
  submitter_email: string | null;
  agreed_to_terms: boolean;
  status: SubmissionStatusRow;
  fingerprint: string;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type ContactMessageRow = {
  id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  fingerprint: string;
  is_read: boolean;
  created_at: string;
}

export type CategoryQuestionCountRow = {
  category_id: string;
  published_question_count: number;
}

type Insertable<Row, Optional extends keyof Row = never> = Omit<Row, Optional> & Partial<Pick<Row, Optional>>;

/** Minimal `Database` generic compatible with supabase-js typing. */
export type Database = {
  public: {
    Tables: {
      categories: {
        Row: CategoryRow;
        Insert: Insertable<CategoryRow, 'id' | 'created_at' | 'updated_at' | 'introduction' | 'icon' | 'status' | 'nav_featured' | 'include_in_mixed_game' | 'requires_age_gate' | 'is_child_safe' | 'is_mature' | 'seasonal_start' | 'seasonal_end' | 'sort_order'>;
        Update: Partial<CategoryRow>;
        Relationships: [];
      };
      questions: {
        Row: QuestionRow;
        Insert: Insertable<QuestionRow, 'id' | 'created_at' | 'updated_at' | 'published_at' | 'share_code' | 'sort_order' | 'display_vote_count' | 'is_demo' | 'status'>;
        Update: Partial<QuestionRow>;
        Relationships: [];
      };
      question_categories: {
        Row: QuestionCategoryRow;
        Insert: Insertable<QuestionCategoryRow, 'created_at'>;
        Update: Partial<QuestionCategoryRow>;
        Relationships: [];
      };
      question_submissions: {
        Row: QuestionSubmissionRow;
        Insert: Insertable<QuestionSubmissionRow, 'id' | 'created_at' | 'updated_at' | 'status' | 'reviewer_notes' | 'agreed_to_terms' | 'submitter_name' | 'submitter_email'>;
        Update: Partial<QuestionSubmissionRow>;
        Relationships: [];
      };
      contact_messages: {
        Row: ContactMessageRow;
        Insert: Insertable<ContactMessageRow, 'id' | 'created_at' | 'is_read'>;
        Update: Partial<ContactMessageRow>;
        Relationships: [];
      };
    };
    Views: {
      category_question_counts: {
        Row: CategoryQuestionCountRow;
        Relationships: [];
      };
    };
    Functions: {
      generate_share_code: {
        Args: { code_length?: number };
        Returns: string;
      };
    };
    Enums: {
      content_status: ContentStatus;
      submission_status: SubmissionStatusRow;
    };
    CompositeTypes: Record<string, never>;
  };
}
