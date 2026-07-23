export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      admin_audit_logs: {
        Row: {
          action: string
          actor_email: string
          actor_role: string
          admin_user_id: string | null
          created_at: string
          id: string
          ip: string | null
          metadata: Json
          target_id: string | null
          target_type: string | null
        }
        Insert: {
          action: string
          actor_email: string
          actor_role: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Update: {
          action?: string
          actor_email?: string
          actor_role?: string
          admin_user_id?: string | null
          created_at?: string
          id?: string
          ip?: string | null
          metadata?: Json
          target_id?: string | null
          target_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notes: {
        Row: {
          admin_user_id: string | null
          author_email: string
          body: string
          created_at: string
          id: string
          organization_id: string
        }
        Insert: {
          admin_user_id?: string | null
          author_email: string
          body: string
          created_at?: string
          id?: string
          organization_id: string
        }
        Update: {
          admin_user_id?: string | null
          author_email?: string
          body?: string
          created_at?: string
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_notes_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_sessions: {
        Row: {
          admin_user_id: string
          created_at: string
          expires_at: string
          fresh_until: string
          id: string
          last_seen_at: string
          revoked_at: string | null
          token_hash: string
          user_id: string
        }
        Insert: {
          admin_user_id: string
          created_at?: string
          expires_at: string
          fresh_until: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          token_hash: string
          user_id: string
        }
        Update: {
          admin_user_id?: string
          created_at?: string
          expires_at?: string
          fresh_until?: string
          id?: string
          last_seen_at?: string
          revoked_at?: string | null
          token_hash?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_sessions_admin_user_id_fkey"
            columns: ["admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_users: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          id: string
          is_active: boolean
          last_login_at: string | null
          name: string
          role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          id?: string
          is_active?: boolean
          last_login_at?: string | null
          name?: string
          role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor: string
          created_at: string
          id: string
          metadata: Json
          organization_id: string | null
        }
        Insert: {
          action: string
          actor: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Update: {
          action?: string
          actor?: string
          created_at?: string
          id?: string
          metadata?: Json
          organization_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_settings: {
        Row: {
          config: Json
          enabled: boolean
          organization_id: string
          scenario: string
          updated_at: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          organization_id: string
          scenario: string
          updated_at?: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          organization_id?: string
          scenario?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          auto_schedule: boolean
          budget_cents: number | null
          budget_spent_cents: number
          code_ttl_seconds: number | null
          collect_email: boolean
          collect_phone: boolean
          created_at: string
          ends_at: string | null
          engagement: Json
          id: string
          name: string
          organization_id: string
          paused_reason: string | null
          starts_at: string | null
          status: string
        }
        Insert: {
          auto_schedule?: boolean
          budget_cents?: number | null
          budget_spent_cents?: number
          code_ttl_seconds?: number | null
          collect_email?: boolean
          collect_phone?: boolean
          created_at?: string
          ends_at?: string | null
          engagement?: Json
          id?: string
          name: string
          organization_id: string
          paused_reason?: string | null
          starts_at?: string | null
          status?: string
        }
        Update: {
          auto_schedule?: boolean
          budget_cents?: number | null
          budget_spent_cents?: number
          code_ttl_seconds?: number | null
          collect_email?: boolean
          collect_phone?: boolean
          created_at?: string
          ends_at?: string | null
          engagement?: Json
          id?: string
          name?: string
          organization_id?: string
          paused_reason?: string | null
          starts_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_awards: {
        Row: {
          code: string
          contest_id: string
          created_at: string
          delivered_at: string | null
          id: string
          organization_id: string
          player_id: string
          rank: number
          reward_label: string
          status: string
        }
        Insert: {
          code: string
          contest_id: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          organization_id: string
          player_id: string
          rank: number
          reward_label: string
          status?: string
        }
        Update: {
          code?: string
          contest_id?: string
          created_at?: string
          delivered_at?: string | null
          id?: string
          organization_id?: string
          player_id?: string
          rank?: number
          reward_label?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_awards_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_awards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_awards_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_final_standings: {
        Row: {
          contest_id: string
          created_at: string
          diff_count: number
          draw_applied: boolean
          exact_count: number
          organization_id: string
          player_id: string
          rank: number
          tiebreaker_delta: number | null
          total_points: number
        }
        Insert: {
          contest_id: string
          created_at?: string
          diff_count: number
          draw_applied?: boolean
          exact_count: number
          organization_id: string
          player_id: string
          rank: number
          tiebreaker_delta?: number | null
          total_points: number
        }
        Update: {
          contest_id?: string
          created_at?: string
          diff_count?: number
          draw_applied?: boolean
          exact_count?: number
          organization_id?: string
          player_id?: string
          rank?: number
          tiebreaker_delta?: number | null
          total_points?: number
        }
        Relationships: [
          {
            foreignKeyName: "contest_final_standings_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_final_standings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_final_standings_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_league_members: {
        Row: {
          joined_at: string
          league_id: string
          player_id: string
        }
        Insert: {
          joined_at?: string
          league_id: string
          player_id: string
        }
        Update: {
          joined_at?: string
          league_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_league_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "contest_leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_league_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_leagues: {
        Row: {
          code: string
          contest_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          code: string
          contest_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          code?: string
          contest_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_leagues_contest_id_organization_id_fkey"
            columns: ["contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contest_leagues_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_leagues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_matches: {
        Row: {
          away_badge: string
          away_color: string
          away_key: string
          away_name: string
          away_penalties: number | null
          away_score: number | null
          contest_id: string
          created_at: string
          external_ref: string
          finish_type: string
          home_badge: string
          home_color: string
          home_key: string
          home_name: string
          home_penalties: number | null
          home_score: number | null
          id: string
          kickoff_at: string
          organization_id: string
          position: number
          status: string
        }
        Insert: {
          away_badge?: string
          away_color?: string
          away_key?: string
          away_name: string
          away_penalties?: number | null
          away_score?: number | null
          contest_id: string
          created_at?: string
          external_ref?: string
          finish_type?: string
          home_badge?: string
          home_color?: string
          home_key?: string
          home_name: string
          home_penalties?: number | null
          home_score?: number | null
          id?: string
          kickoff_at: string
          organization_id: string
          position?: number
          status?: string
        }
        Update: {
          away_badge?: string
          away_color?: string
          away_key?: string
          away_name?: string
          away_penalties?: number | null
          away_score?: number | null
          contest_id?: string
          created_at?: string
          external_ref?: string
          finish_type?: string
          home_badge?: string
          home_color?: string
          home_key?: string
          home_name?: string
          home_penalties?: number | null
          home_score?: number | null
          id?: string
          kickoff_at?: string
          organization_id?: string
          position?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_matches_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_matches_contest_org_fk"
            columns: ["contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contest_matches_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_players: {
        Row: {
          accepted_terms: boolean
          avatar: string
          contest_id: string
          created_at: string
          email: string | null
          first_name: string
          id: string
          organization_id: string
          phone: string | null
          tiebreaker_guess: number | null
          token_hash: string
        }
        Insert: {
          accepted_terms?: boolean
          avatar?: string
          contest_id: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          organization_id: string
          phone?: string | null
          tiebreaker_guess?: number | null
          token_hash: string
        }
        Update: {
          accepted_terms?: boolean
          avatar?: string
          contest_id?: string
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          organization_id?: string
          phone?: string | null
          tiebreaker_guess?: number | null
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_players_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_players_contest_org_fk"
            columns: ["contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contest_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_predictions: {
        Row: {
          away_score: number
          contest_id: string
          created_at: string
          home_score: number
          id: string
          match_id: string
          organization_id: string
          player_id: string
          points: number | null
          updated_at: string
        }
        Insert: {
          away_score: number
          contest_id: string
          created_at?: string
          home_score: number
          id?: string
          match_id: string
          organization_id: string
          player_id: string
          points?: number | null
          updated_at?: string
        }
        Update: {
          away_score?: number
          contest_id?: string
          created_at?: string
          home_score?: number
          id?: string
          match_id?: string
          organization_id?: string
          player_id?: string
          points?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contest_predictions_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_predictions_contest_org_fk"
            columns: ["contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contest_predictions_match_contest_org_fk"
            columns: ["match_id", "contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contest_matches"
            referencedColumns: ["id", "contest_id", "organization_id"]
          },
          {
            foreignKeyName: "contest_predictions_match_id_fkey"
            columns: ["match_id"]
            isOneToOne: false
            referencedRelation: "contest_matches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_predictions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_predictions_player_contest_org_fk"
            columns: ["player_id", "contest_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id", "contest_id", "organization_id"]
          },
          {
            foreignKeyName: "contest_predictions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
        ]
      }
      contest_recovery_tokens: {
        Row: {
          contest_id: string
          created_at: string
          expires_at: string
          id: string
          organization_id: string
          player_id: string
          token_hash: string
          used_at: string | null
        }
        Insert: {
          contest_id: string
          created_at?: string
          expires_at: string
          id?: string
          organization_id: string
          player_id: string
          token_hash: string
          used_at?: string | null
        }
        Update: {
          contest_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          organization_id?: string
          player_id?: string
          token_hash?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contest_recovery_tokens_contest_id_fkey"
            columns: ["contest_id"]
            isOneToOne: false
            referencedRelation: "contests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_recovery_tokens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contest_recovery_tokens_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "contest_players"
            referencedColumns: ["id"]
          },
        ]
      }
      contests: {
        Row: {
          collect_email: boolean
          collect_phone: boolean
          competition_key: string
          created_at: string
          finalized_at: string | null
          id: string
          last_sync_error: string | null
          last_synced_at: string | null
          name: string
          organization_id: string
          rewards: Json
          scoring: Json
          slug: string
          status: string
          tiebreaker_answer: number | null
          tiebreaker_question: string | null
        }
        Insert: {
          collect_email?: boolean
          collect_phone?: boolean
          competition_key: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          name: string
          organization_id: string
          rewards?: Json
          scoring?: Json
          slug: string
          status?: string
          tiebreaker_answer?: number | null
          tiebreaker_question?: string | null
        }
        Update: {
          collect_email?: boolean
          collect_phone?: boolean
          competition_key?: string
          created_at?: string
          finalized_at?: string | null
          id?: string
          last_sync_error?: string | null
          last_synced_at?: string | null
          name?: string
          organization_id?: string
          rewards?: Json
          scoring?: Json
          slug?: string
          status?: string
          tiebreaker_answer?: number | null
          tiebreaker_question?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      email_log: {
        Row: {
          dedup_key: string
          id: string
          organization_id: string
          participation_id: string | null
          recipient: string
          scenario: string
          sent_at: string
        }
        Insert: {
          dedup_key: string
          id?: string
          organization_id: string
          participation_id?: string | null
          recipient: string
          scenario: string
          sent_at?: string
        }
        Update: {
          dedup_key?: string
          id?: string
          organization_id?: string
          participation_id?: string | null
          recipient?: string
          scenario?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_log_participation_id_fkey"
            columns: ["participation_id"]
            isOneToOne: false
            referencedRelation: "participations"
            referencedColumns: ["id"]
          },
        ]
      }
      fixture_cache: {
        Row: {
          fetched_at: string
          last_error: string | null
          league_id: string
          payload: Json
          provider_status: string
          refresh_claimed_at: string | null
        }
        Insert: {
          fetched_at?: string
          last_error?: string | null
          league_id: string
          payload?: Json
          provider_status?: string
          refresh_claimed_at?: string | null
        }
        Update: {
          fetched_at?: string
          last_error?: string | null
          league_id?: string
          payload?: Json
          provider_status?: string
          refresh_claimed_at?: string | null
        }
        Relationships: []
      }
      hunt_completions: {
        Row: {
          code: string
          completed_at: string
          email: string | null
          hunt_id: string
          id: string
          marketing_opt_in: boolean
          organization_id: string
          player_id: string
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          code: string
          completed_at?: string
          email?: string | null
          hunt_id: string
          id?: string
          marketing_opt_in?: boolean
          organization_id: string
          player_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          code?: string
          completed_at?: string
          email?: string | null
          hunt_id?: string
          id?: string
          marketing_opt_in?: boolean
          organization_id?: string
          player_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hunt_completions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_completions_player_id_hunt_id_organization_id_fkey"
            columns: ["player_id", "hunt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "hunt_players"
            referencedColumns: ["id", "hunt_id", "organization_id"]
          },
        ]
      }
      hunt_players: {
        Row: {
          created_at: string
          hunt_id: string
          id: string
          organization_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          hunt_id: string
          id?: string
          organization_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          hunt_id?: string
          id?: string
          organization_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_players_hunt_id_organization_id_fkey"
            columns: ["hunt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "hunt_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hunt_scans: {
        Row: {
          hunt_id: string
          id: string
          organization_id: string
          player_id: string
          scanned_at: string
          step_id: string
        }
        Insert: {
          hunt_id: string
          id?: string
          organization_id: string
          player_id: string
          scanned_at?: string
          step_id: string
        }
        Update: {
          hunt_id?: string
          id?: string
          organization_id?: string
          player_id?: string
          scanned_at?: string
          step_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_scans_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hunt_scans_player_id_hunt_id_organization_id_fkey"
            columns: ["player_id", "hunt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "hunt_players"
            referencedColumns: ["id", "hunt_id", "organization_id"]
          },
          {
            foreignKeyName: "hunt_scans_step_id_hunt_id_organization_id_fkey"
            columns: ["step_id", "hunt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "hunt_steps"
            referencedColumns: ["id", "hunt_id", "organization_id"]
          },
        ]
      }
      hunt_steps: {
        Row: {
          created_at: string
          hint_text: string | null
          hunt_id: string
          id: string
          label: string
          organization_id: string
          position: number
          token: string
        }
        Insert: {
          created_at?: string
          hint_text?: string | null
          hunt_id: string
          id?: string
          label: string
          organization_id: string
          position: number
          token: string
        }
        Update: {
          created_at?: string
          hint_text?: string | null
          hunt_id?: string
          id?: string
          label?: string
          organization_id?: string
          position?: number
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunt_steps_hunt_id_organization_id_fkey"
            columns: ["hunt_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "hunts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "hunt_steps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      hunts: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          min_scan_interval_seconds: number
          name: string
          order_mode: string
          organization_id: string
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_stock: number | null
          starts_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          min_scan_interval_seconds?: number
          name: string
          order_mode?: string
          organization_id: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          starts_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          min_scan_interval_seconds?: number
          name?: string
          order_mode?: string
          organization_id?: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          starts_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hunts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jackpot_campaigns: {
        Row: {
          created_at: string
          current_count: number
          cycle: number
          display_base_cents: number
          display_increment_cents: number
          draw_at: string | null
          draw_mode: string
          id: string
          merchant_content: string | null
          min_participation_interval_seconds: number
          name: string
          organization_id: string
          public_slug: string | null
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_stock: number
          rotating_period_seconds: number
          rotating_secret: string | null
          status: string
          threshold: number
          validation_mode: string
          win_probability: number | null
        }
        Insert: {
          created_at?: string
          current_count?: number
          cycle?: number
          display_base_cents?: number
          display_increment_cents?: number
          draw_at?: string | null
          draw_mode?: string
          id?: string
          merchant_content?: string | null
          min_participation_interval_seconds?: number
          name: string
          organization_id: string
          public_slug?: string | null
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock: number
          rotating_period_seconds?: number
          rotating_secret?: string | null
          status?: string
          threshold?: number
          validation_mode?: string
          win_probability?: number | null
        }
        Update: {
          created_at?: string
          current_count?: number
          cycle?: number
          display_base_cents?: number
          display_increment_cents?: number
          draw_at?: string | null
          draw_mode?: string
          id?: string
          merchant_content?: string | null
          min_participation_interval_seconds?: number
          name?: string
          organization_id?: string
          public_slug?: string | null
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number
          rotating_period_seconds?: number
          rotating_secret?: string | null
          status?: string
          threshold?: number
          validation_mode?: string
          win_probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "jackpot_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jackpot_participants: {
        Row: {
          campaign_id: string
          created_at: string
          cycle: number
          id: string
          organization_id: string
          player_token_hash: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          cycle: number
          id?: string
          organization_id: string
          player_token_hash: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          cycle?: number
          id?: string
          organization_id?: string
          player_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "jackpot_participants_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "jackpot_campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "jackpot_participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jackpot_players: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          last_participation_at: string | null
          organization_id: string
          participation_count: number
          token_hash: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          last_participation_at?: string | null
          organization_id: string
          participation_count?: number
          token_hash: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          last_participation_at?: string | null
          organization_id?: string
          participation_count?: number
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "jackpot_players_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "jackpot_campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "jackpot_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jackpot_wins: {
        Row: {
          campaign_id: string
          code: string
          cycle: number
          draw_seed: string
          drawn_at: string
          id: string
          organization_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          winner_token_hash: string
        }
        Insert: {
          campaign_id: string
          code: string
          cycle: number
          draw_seed: string
          drawn_at?: string
          id?: string
          organization_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          winner_token_hash: string
        }
        Update: {
          campaign_id?: string
          code?: string
          cycle?: number
          draw_seed?: string
          drawn_at?: string
          id?: string
          organization_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          winner_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "jackpot_wins_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "jackpot_campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "jackpot_wins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          organization_id: string | null
          payload: Json
          run_after: string
          status: string
          type: string
        }
        Insert: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          organization_id?: string | null
          payload?: Json
          run_after?: string
          status?: string
          type: string
        }
        Update: {
          attempts?: number
          completed_at?: string | null
          created_at?: string
          id?: string
          idempotency_key?: string | null
          last_error?: string | null
          locked_until?: string | null
          max_attempts?: number
          organization_id?: string | null
          payload?: Json
          run_after?: string
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_members: {
        Row: {
          created_at: string
          id: string
          last_stamp_at: string | null
          organization_id: string
          program_id: string
          tier: string
          token_hash: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          last_stamp_at?: string | null
          organization_id: string
          program_id: string
          tier?: string
          token_hash: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          id?: string
          last_stamp_at?: string | null
          organization_id?: string
          program_id?: string
          tier?: string
          token_hash?: string
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_members_program_id_organization_id_fkey"
            columns: ["program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      loyalty_milestones: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          position: number
          program_id: string
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_stock: number | null
          reward_type: string
          target_wheel_id: string | null
          visit_count: number
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          position?: number
          program_id: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          reward_type: string
          target_wheel_id?: string | null
          visit_count: number
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          position?: number
          program_id?: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          reward_type?: string
          target_wheel_id?: string | null
          visit_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_milestones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_milestones_program_id_organization_id_fkey"
            columns: ["program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "loyalty_milestones_target_wheel_id_organization_id_fkey"
            columns: ["target_wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          created_at: string
          gold_threshold: number
          id: string
          min_stamp_interval_seconds: number
          name: string
          organization_id: string
          rotating_period_seconds: number
          rotating_secret: string | null
          silver_threshold: number
          status: string
          validation_mode: string
        }
        Insert: {
          created_at?: string
          gold_threshold?: number
          id?: string
          min_stamp_interval_seconds?: number
          name: string
          organization_id: string
          rotating_period_seconds?: number
          rotating_secret?: string | null
          silver_threshold?: number
          status?: string
          validation_mode?: string
        }
        Update: {
          created_at?: string
          gold_threshold?: number
          id?: string
          min_stamp_interval_seconds?: number
          name?: string
          organization_id?: string
          rotating_period_seconds?: number
          rotating_secret?: string | null
          silver_threshold?: number
          status?: string
          validation_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_rewards: {
        Row: {
          code: string | null
          consumed_at: string | null
          earned_at: string
          grant_token: string | null
          id: string
          member_id: string
          milestone_id: string
          organization_id: string
          program_id: string
          redeemed_at: string | null
          redeemed_by: string | null
          resulting_spin_id: string | null
          reward_type: string
        }
        Insert: {
          code?: string | null
          consumed_at?: string | null
          earned_at?: string
          grant_token?: string | null
          id?: string
          member_id: string
          milestone_id: string
          organization_id: string
          program_id: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          reward_type: string
        }
        Update: {
          code?: string | null
          consumed_at?: string | null
          earned_at?: string
          grant_token?: string | null
          id?: string
          member_id?: string
          milestone_id?: string
          organization_id?: string
          program_id?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          reward_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_member_id_program_id_organization_id_fkey"
            columns: ["member_id", "program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_members"
            referencedColumns: ["id", "program_id", "organization_id"]
          },
          {
            foreignKeyName: "loyalty_rewards_milestone_id_organization_id_fkey"
            columns: ["milestone_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_milestones"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "loyalty_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_resulting_spin_id_fkey"
            columns: ["resulting_spin_id"]
            isOneToOne: false
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_stamps: {
        Row: {
          id: string
          member_id: string
          mode: string
          organization_id: string
          program_id: string
          stamped_at: string
          validated_by: string | null
        }
        Insert: {
          id?: string
          member_id: string
          mode: string
          organization_id: string
          program_id: string
          stamped_at?: string
          validated_by?: string | null
        }
        Update: {
          id?: string
          member_id?: string
          mode?: string
          organization_id?: string
          program_id?: string
          stamped_at?: string
          validated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_stamps_member_id_program_id_organization_id_fkey"
            columns: ["member_id", "program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_members"
            referencedColumns: ["id", "program_id", "organization_id"]
          },
          {
            foreignKeyName: "loyalty_stamps_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      merchant_deletion_jobs: {
        Row: {
          actor_admin_user_id: string | null
          actor_email: string
          cleanup_errors: Json
          completed_at: string | null
          created_at: string
          id: string
          last_error: string | null
          member_user_ids: string[]
          organization_id: string
          organization_name: string
          organization_slug: string
          status: string
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          actor_admin_user_id?: string | null
          actor_email: string
          cleanup_errors?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          member_user_ids?: string[]
          organization_id: string
          organization_name: string
          organization_slug: string
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          actor_admin_user_id?: string | null
          actor_email?: string
          cleanup_errors?: Json
          completed_at?: string | null
          created_at?: string
          id?: string
          last_error?: string | null
          member_user_ids?: string[]
          organization_id?: string
          organization_name?: string
          organization_slug?: string
          status?: string
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "merchant_deletion_jobs_actor_admin_user_id_fkey"
            columns: ["actor_admin_user_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_campaigns: {
        Row: {
          body: string
          completed_at: string | null
          created_at: string
          id: string
          organization_id: string
          recipient_count: number
          segment: string
          sent_count: number | null
          status: string
          subject: string
        }
        Insert: {
          body: string
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          recipient_count?: number
          segment?: string
          sent_count?: number | null
          status?: string
          subject: string
        }
        Update: {
          body?: string
          completed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          recipient_count?: number
          segment?: string
          sent_count?: number | null
          status?: string
          subject?: string
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_campaigns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      newsletter_subscribers: {
        Row: {
          birth_date: string | null
          created_at: string
          email: string
          id: string
          last_reengaged_at: string | null
          organization_id: string
          source: string
          unsubscribed_at: string | null
        }
        Insert: {
          birth_date?: string | null
          created_at?: string
          email: string
          id?: string
          last_reengaged_at?: string | null
          organization_id: string
          source?: string
          unsubscribed_at?: string | null
        }
        Update: {
          birth_date?: string | null
          created_at?: string
          email?: string
          id?: string
          last_reengaged_at?: string | null
          organization_id?: string
          source?: string
          unsubscribed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "newsletter_subscribers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ops_metrics: {
        Row: {
          created_at: string
          duration_ms: number
          id: number
          ok: boolean
          op: string
        }
        Insert: {
          created_at?: string
          duration_ms: number
          id?: never
          ok: boolean
          op: string
        }
        Update: {
          created_at?: string
          duration_ms?: number
          id?: never
          ok?: boolean
          op?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          organization_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          addon_hunts: boolean
          addon_jackpot: boolean
          addon_loyalty: boolean
          addon_pronostics: boolean
          auto_reengage: boolean
          comp_access: boolean
          comp_access_note: string
          comp_access_until: string | null
          created_at: string
          data_retention_months: number | null
          id: string
          last_reengage_run_at: string | null
          logo_url: string | null
          name: string
          notify_on_win: boolean
          past_due_since: string | null
          plan: string
          slug: string
          stripe_customer_id: string | null
          stripe_event_created_at: string | null
          subscription_status: string
          timezone: string
          trial_ends_at: string
          webhook_secret: string
          webhook_url: string | null
        }
        Insert: {
          addon_hunts?: boolean
          addon_jackpot?: boolean
          addon_loyalty?: boolean
          addon_pronostics?: boolean
          auto_reengage?: boolean
          comp_access?: boolean
          comp_access_note?: string
          comp_access_until?: string | null
          created_at?: string
          data_retention_months?: number | null
          id?: string
          last_reengage_run_at?: string | null
          logo_url?: string | null
          name: string
          notify_on_win?: boolean
          past_due_since?: string | null
          plan?: string
          slug: string
          stripe_customer_id?: string | null
          stripe_event_created_at?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Update: {
          addon_hunts?: boolean
          addon_jackpot?: boolean
          addon_loyalty?: boolean
          addon_pronostics?: boolean
          auto_reengage?: boolean
          comp_access?: boolean
          comp_access_note?: string
          comp_access_until?: string | null
          created_at?: string
          data_retention_months?: number | null
          id?: string
          last_reengage_run_at?: string | null
          logo_url?: string | null
          name?: string
          notify_on_win?: boolean
          past_due_since?: string | null
          plan?: string
          slug?: string
          stripe_customer_id?: string | null
          stripe_event_created_at?: string | null
          subscription_status?: string
          timezone?: string
          trial_ends_at?: string
          webhook_secret?: string
          webhook_url?: string | null
        }
        Relationships: []
      }
      participations: {
        Row: {
          accepted_terms: boolean
          basket_cents: number | null
          campaign_id: string
          cancelled_at: string | null
          cancelled_reason: string | null
          created_at: string
          email: string | null
          first_name: string | null
          id: string
          marketing_opt_in: boolean
          organization_id: string
          phone: string | null
          player_key: string
          prize_id: string | null
          redeem_code: string | null
          redeem_expires_at: string | null
          redeemed_at: string | null
          spin_id: string | null
          wheel_id: string
        }
        Insert: {
          accepted_terms: boolean
          basket_cents?: number | null
          campaign_id: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          organization_id: string
          phone?: string | null
          player_key: string
          prize_id?: string | null
          redeem_code?: string | null
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          spin_id?: string | null
          wheel_id: string
        }
        Update: {
          accepted_terms?: boolean
          basket_cents?: number | null
          campaign_id?: string
          cancelled_at?: string | null
          cancelled_reason?: string | null
          created_at?: string
          email?: string | null
          first_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          organization_id?: string
          phone?: string | null
          player_key?: string
          prize_id?: string | null
          redeem_code?: string | null
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          spin_id?: string | null
          wheel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "participations_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_campaign_org_fk"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "participations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_prize_wheel_org_fk"
            columns: ["prize_id", "wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id", "wheel_id", "organization_id"]
          },
          {
            foreignKeyName: "participations_spin_id_fkey"
            columns: ["spin_id"]
            isOneToOne: true
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participations_wheel_campaign_org_fk"
            columns: ["wheel_id", "campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "campaign_id", "organization_id"]
          },
          {
            foreignKeyName: "participations_wheel_id_fkey"
            columns: ["wheel_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id"]
          },
        ]
      }
      prizes: {
        Row: {
          color: string
          cost_cents: number | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          is_losing: boolean
          label: string
          low_stock_notified_at: string | null
          low_stock_threshold: number | null
          organization_id: string
          position: number
          stock: number | null
          value_cents: number | null
          weight: number
          wheel_id: string
        }
        Insert: {
          color?: string
          cost_cents?: number | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_losing?: boolean
          label: string
          low_stock_notified_at?: string | null
          low_stock_threshold?: number | null
          organization_id: string
          position?: number
          stock?: number | null
          value_cents?: number | null
          weight?: number
          wheel_id: string
        }
        Update: {
          color?: string
          cost_cents?: number | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          is_losing?: boolean
          label?: string
          low_stock_notified_at?: string | null
          low_stock_threshold?: number | null
          organization_id?: string
          position?: number
          stock?: number | null
          value_cents?: number | null
          weight?: number
          wheel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "prizes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_wheel_id_fkey"
            columns: ["wheel_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prizes_wheel_org_fk"
            columns: ["wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      qr_codes: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          label: string
          organization_id: string
          poster: Json
          scan_count: number
          slug: string
          style: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          label?: string
          organization_id: string
          poster?: Json
          scan_count?: number
          slug: string
          style?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          label?: string
          organization_id?: string
          poster?: Json
          scan_count?: number
          slug?: string
          style?: Json
        }
        Relationships: [
          {
            foreignKeyName: "qr_campaign_org_fk"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "qr_codes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qr_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket: string
          count: number
          window_start: string
        }
        Insert: {
          bucket: string
          count?: number
          window_start: string
        }
        Update: {
          bucket?: string
          count?: number
          window_start?: string
        }
        Relationships: []
      }
      spins: {
        Row: {
          campaign_id: string
          claimed: boolean
          created_at: string
          engagement_action: string | null
          id: string
          is_losing: boolean
          organization_id: string
          play_window_key: string | null
          player_key: string
          prize_id: string | null
          source: string
          wheel_id: string
        }
        Insert: {
          campaign_id: string
          claimed?: boolean
          created_at?: string
          engagement_action?: string | null
          id?: string
          is_losing?: boolean
          organization_id: string
          play_window_key?: string | null
          player_key: string
          prize_id?: string | null
          source?: string
          wheel_id: string
        }
        Update: {
          campaign_id?: string
          claimed?: boolean
          created_at?: string
          engagement_action?: string | null
          id?: string
          is_losing?: boolean
          organization_id?: string
          play_window_key?: string | null
          player_key?: string
          prize_id?: string | null
          source?: string
          wheel_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "spins_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spins_campaign_org_fk"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "spins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spins_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "spins_prize_wheel_org_fk"
            columns: ["prize_id", "wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "prizes"
            referencedColumns: ["id", "wheel_id", "organization_id"]
          },
          {
            foreignKeyName: "spins_wheel_campaign_org_fk"
            columns: ["wheel_id", "campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "campaign_id", "organization_id"]
          },
          {
            foreignKeyName: "spins_wheel_id_fkey"
            columns: ["wheel_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_events: {
        Row: {
          created_at: string
          event_created_at: string | null
          id: string
          processed_at: string | null
        }
        Insert: {
          created_at?: string
          event_created_at?: string | null
          id: string
          processed_at?: string | null
        }
        Update: {
          created_at?: string
          event_created_at?: string | null
          id?: string
          processed_at?: string | null
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          organization_id: string
          revoked_at: string | null
          role: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at: string
          id?: string
          invited_by: string
          organization_id: string
          revoked_at?: string | null
          role?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          organization_id?: string
          revoked_at?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_deliveries: {
        Row: {
          attempts: number
          created_at: string
          data: Json
          delivered_at: string | null
          event: string
          failed_at: string | null
          id: string
          last_error: string | null
          locked_until: string | null
          next_attempt_at: string
          organization_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          data: Json
          delivered_at?: string | null
          event: string
          failed_at?: string | null
          id?: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          organization_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          data?: Json
          delivered_at?: string | null
          event?: string
          failed_at?: string | null
          id?: string
          last_error?: string | null
          locked_until?: string | null
          next_attempt_at?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_deliveries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      wheels: {
        Row: {
          campaign_id: string
          created_at: string
          game_type: string
          id: string
          name: string
          organization_id: string
          play_limit: string
          position: number
          schedule_days: number[] | null
          schedule_end_hour: number | null
          schedule_start_hour: number | null
          style: Json
          theme: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          game_type?: string
          id?: string
          name?: string
          organization_id: string
          play_limit?: string
          position?: number
          schedule_days?: number[] | null
          schedule_end_hour?: number | null
          schedule_start_hour?: number | null
          style?: Json
          theme?: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          game_type?: string
          id?: string
          name?: string
          organization_id?: string
          play_limit?: string
          position?: number
          schedule_days?: number[] | null
          schedule_end_hour?: number | null
          schedule_start_hour?: number | null
          style?: Json
          theme?: Json
        }
        Relationships: [
          {
            foreignKeyName: "wheels_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wheels_campaign_org_fk"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "wheels_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_team_invitation: {
        Args: { p_invitation_id: string }
        Returns: string
      }
      admin_participations_daily: {
        Args: { p_days?: number }
        Returns: {
          count: number
          day: string
        }[]
      }
      admin_top_merchants: {
        Args: { p_limit?: number }
        Returns: {
          name: string
          organization_id: string
          spins: number
        }[]
      }
      admin_user_id_by_email: { Args: { p_email: string }; Returns: string }
      applied_migrations_info: {
        Args: never
        Returns: {
          latest: string
          total: number
        }[]
      }
      apply_stripe_subscription_event: {
        Args: {
          p_customer_id: string
          p_event_created_at: string
          p_event_id: string
          p_status: string
          p_trial_ends_at: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          organization_id: string
        }[]
      }
      automation_birthday_targets: {
        Args: { p_limit?: number; p_organization_id: string }
        Returns: {
          birth_date: string
          email: string
          first_name: string
        }[]
      }
      automation_inactive_targets: {
        Args: { p_days: number; p_limit?: number; p_organization_id: string }
        Returns: {
          email: string
          first_name: string
        }[]
      }
      automation_post_redemption_targets: {
        Args: {
          p_delay_hours: number
          p_limit?: number
          p_organization_id: string
        }
        Returns: {
          campaign_id: string
          campaign_name: string
          email: string
          first_name: string
          participation_id: string
          prize_label: string
          redeemed_at: string
        }[]
      }
      automation_won_not_redeemed_targets: {
        Args: {
          p_limit?: number
          p_min_age_hours: number
          p_organization_id: string
        }
        Returns: {
          campaign_id: string
          campaign_name: string
          email: string
          first_name: string
          organization_id: string
          participation_id: string
          prize_label: string
          redeem_code: string
          redeem_expires_at: string
        }[]
      }
      campaign_prize_performance: {
        Args: { p_campaign_id: string }
        Returns: {
          claimed: number
          color: string
          distributed: number
          label: string
          prize_id: string
          redeemed: number
        }[]
      }
      cancel_participation: {
        Args: {
          p_organization_id: string
          p_participation_id: string
          p_reason: string
          p_restock?: boolean
        }
        Returns: boolean
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      claim_fixture_refresh: {
        Args: { p_league_id: string; p_ttl_seconds?: number }
        Returns: boolean
      }
      claim_jobs: {
        Args: { p_limit?: number; p_lock_seconds?: number; p_types: string[] }
        Returns: {
          attempts: number
          completed_at: string | null
          created_at: string
          id: string
          idempotency_key: string | null
          last_error: string | null
          locked_until: string | null
          max_attempts: number
          organization_id: string | null
          payload: Json
          run_after: string
          status: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_webhook_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          data: Json
          event: string
          id: string
          organization_id: string
        }[]
      }
      claim_winning_spin: {
        Args: {
          p_accepted_terms: boolean
          p_email: string
          p_first_name: string
          p_marketing_opt_in: boolean
          p_phone: string
          p_spin_id: string
        }
        Returns: {
          participation_id: string
          redeem_code: string
        }[]
      }
      consume_loyalty_spin_grant: {
        Args: {
          p_grant_token: string
          p_member_token_hash: string
          p_program_id: string
        }
        Returns: Json
      }
      contest_is_locked: { Args: { p_contest_id: string }; Returns: boolean }
      contest_leaderboard: {
        Args: {
          p_contest_id: string
          p_league_id?: string
          p_limit?: number
          p_offset?: number
        }
        Returns: {
          avatar: string
          diff_count: number
          email: string
          exact_count: number
          first_name: string
          player_id: string
          prediction_count: number
          rank: number
          total_players: number
          total_points: number
        }[]
      }
      contest_player_rank: {
        Args: {
          p_contest_id: string
          p_league_id?: string
          p_player_id: string
        }
        Returns: {
          avatar: string
          diff_count: number
          email: string
          exact_count: number
          first_name: string
          player_id: string
          prediction_count: number
          rank: number
          total_players: number
          total_points: number
        }[]
      }
      contest_prediction_points: {
        Args: {
          p_actual_away: number
          p_actual_home: number
          p_predicted_away: number
          p_predicted_home: number
          p_scoring: Json
        }
        Returns: number
      }
      create_contest_league: {
        Args: { p_contest_id: string; p_name: string; p_player_id: string }
        Returns: {
          code: string
          league_id: string
          name: string
        }[]
      }
      create_organization: {
        Args: { org_name: string; org_slug: string }
        Returns: string
      }
      cron_last_success: {
        Args: never
        Returns: {
          jobname: string
          last_run: string
          last_status: string
          last_success: string
          schedule: string
        }[]
      }
      current_jackpot_code: { Args: { p_campaign_id: string }; Returns: string }
      current_loyalty_code: { Args: { p_program_id: string }; Returns: string }
      decrement_prize_stock: { Args: { p_prize_id: string }; Returns: boolean }
      delete_contest: {
        Args: { p_contest_id: string; p_organization_id: string }
        Returns: string
      }
      delete_contest_match: {
        Args: {
          p_match_id: string
          p_organization_id: string
          p_reason?: string
        }
        Returns: boolean
      }
      finalize_contest: {
        Args: {
          p_contest_id: string
          p_organization_id: string
          p_tiebreaker_answer?: number
        }
        Returns: Json
      }
      grant_first_super_admin: { Args: { p_email: string }; Returns: string }
      increment_qr_scan: { Args: { p_slug: string }; Returns: undefined }
      is_org_editor: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_owner: { Args: { org_id: string }; Returns: boolean }
      is_valid_contest_rewards: { Args: { p_value: Json }; Returns: boolean }
      is_valid_contest_scoring: { Args: { p_value: Json }; Returns: boolean }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      join_contest_league: {
        Args: { p_code: string; p_contest_id: string; p_player_id: string }
        Returns: {
          code: string
          league_id: string
          name: string
        }[]
      }
      leave_contest_league: {
        Args: { p_contest_id: string; p_league_id: string; p_player_id: string }
        Returns: boolean
      }
      lookup_redeem_code: {
        Args: { p_organization_id: string; p_redeem_code: string }
        Returns: {
          campaign_name: string
          created_at: string
          first_name: string
          id: string
          prize_description: string
          prize_label: string
          redeem_code: string
          redeemed_at: string
        }[]
      }
      ops_metrics_summary: {
        Args: { p_hours?: number }
        Returns: {
          calls: number
          error_rate: number
          op: string
          p50_ms: number
          p95_ms: number
        }[]
      }
      org_campaign_stats: {
        Args: { p_organization_id: string }
        Returns: {
          campaign_id: string
          pending: number
          spins: number
          wins: number
        }[]
      }
      org_customer_profiles: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          first_name: string
          first_win: string
          last_win: string
          redeemed: number
          wins: number
        }[]
      }
      org_customer_profiles_page: {
        Args: { p_limit?: number; p_offset?: number; p_organization_id: string }
        Returns: {
          email: string
          first_name: string
          first_win: string
          last_win: string
          redeemed: number
          total_count: number
          wins: number
        }[]
      }
      org_dashboard_summary: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      org_prize_funnel: {
        Args: { p_days?: number; p_organization_id: string }
        Returns: {
          basket_revenue_cents: number
          cancelled: number
          claimed: number
          expired: number
          redeemed: number
          redeemed_cost_cents: number
          redeemed_value_cents: number
          spins_total: number
          wins: number
        }[]
      }
      org_reengagement_targets: {
        Args: {
          p_cooldown_days?: number
          p_inactive_days?: number
          p_organization_id: string
        }
        Returns: {
          email: string
          subscriber_id: string
        }[]
      }
      org_segment_counts: {
        Args: { p_organization_id: string }
        Returns: {
          all_count: number
          inactive_count: number
          loyal_count: number
          new_count: number
        }[]
      }
      org_segment_emails: {
        Args: {
          p_inactive_days?: number
          p_loyal_wins?: number
          p_organization_id: string
          p_segment: string
        }
        Returns: {
          email: string
          subscriber_id: string
        }[]
      }
      org_team_members: {
        Args: { p_organization_id: string }
        Returns: {
          email: string
          joined_at: string
          role: string
          user_id: string
        }[]
      }
      perform_atomic_spin: {
        Args: {
          p_campaign_id: string
          p_engagement_action: string
          p_organization_id: string
          p_player_key: string
          p_source: string
          p_wheel_id: string
        }
        Returns: {
          denial_reason: string
          is_losing: boolean
          next_eligible_at: string
          prize_id: string
          spin_id: string
        }[]
      }
      prune_rate_limits: {
        Args: { p_older_than_seconds?: number }
        Returns: undefined
      }
      purge_expired_contest_players: { Args: never; Returns: number }
      purge_expired_hunt_players: { Args: never; Returns: number }
      purge_expired_jackpot_players: { Args: never; Returns: number }
      purge_expired_loyalty_members: { Args: never; Returns: number }
      purge_expired_personal_data: {
        Args: never
        Returns: {
          organizations_processed: number
          participations_deleted: number
          subscribers_deleted: number
        }[]
      }
      record_hunt_scan: {
        Args: { p_player_token_hash: string; p_step_token: string }
        Returns: Json
      }
      record_jackpot_participation: {
        Args: {
          p_campaign_id: string
          p_player_token_hash: string
          p_rotating_code?: string
          p_validated_by?: string
        }
        Returns: Json
      }
      record_loyalty_stamp: {
        Args: {
          p_member_token_hash: string
          p_program_id: string
          p_rotating_code?: string
          p_validated_by?: string
        }
        Returns: Json
      }
      redeem_by_code: {
        Args: {
          p_actor: string
          p_basket_cents?: number
          p_organization_id: string
          p_redeem_code: string
        }
        Returns: {
          basket_cents: number
          campaign_name: string
          cancelled_at: string
          created_at: string
          first_name: string
          id: string
          prize_description: string
          prize_label: string
          redeem_code: string
          redeem_expires_at: string
          redeemed_at: string
          redeemed_now: boolean
        }[]
      }
      redeem_hunt_completion: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          code: string
          completed_at: string
          hunt_name: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
        }[]
      }
      redeem_jackpot_prize: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          campaign_name: string
          code: string
          drawn_at: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
        }[]
      }
      redeem_loyalty_reward: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          code: string
          earned_at: string
          id: string
          program_name: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
        }[]
      }
      redeem_participation: {
        Args: { p_organization_id: string; p_participation_id: string }
        Returns: string
      }
      requeue_stale_jobs: { Args: never; Returns: number }
      restore_prize_stock: { Args: { p_prize_id: string }; Returns: undefined }
      run_campaign_schedule: {
        Args: never
        Returns: {
          action: string
          campaign_id: string
          organization_id: string
        }[]
      }
      run_jackpot_date_draws: {
        Args: never
        Returns: {
          campaign_id: string
          code: string
          cycle: number
          organization_id: string
        }[]
      }
      set_contest_award_status: {
        Args: {
          p_award_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_contest_match_result: {
        Args: {
          p_away_penalties?: number
          p_away_score: number
          p_finish_type?: string
          p_home_penalties?: number
          p_home_score: number
          p_match_id: string
          p_organization_id: string
        }
        Returns: boolean
      }
      set_contest_status: {
        Args: {
          p_contest_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      submit_contest_prediction: {
        Args: {
          p_away_score: number
          p_contest_id: string
          p_home_score: number
          p_match_id: string
          p_player_id: string
        }
        Returns: boolean
      }
      update_admin_safely: {
        Args: { p_admin_id: string; p_is_active?: boolean; p_role?: string }
        Returns: boolean
      }
      update_contest_rewards: {
        Args: {
          p_contest_id: string
          p_organization_id: string
          p_reason?: string
          p_rewards: Json
        }
        Returns: boolean
      }
      update_contest_scoring: {
        Args: {
          p_contest_id: string
          p_diff: number
          p_exact: number
          p_organization_id: string
          p_reason?: string
          p_winner: number
        }
        Returns: boolean
      }
      update_contest_tiebreaker: {
        Args: {
          p_answer?: number
          p_contest_id: string
          p_organization_id: string
          p_question: string
        }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
