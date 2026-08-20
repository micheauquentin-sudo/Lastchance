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
      calendar_days: {
        Row: {
          calendar_id: string
          content_text: string | null
          content_type: string
          created_at: string
          day_index: number
          id: string
          is_special: boolean
          organization_id: string
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_stock: number | null
          target_wheel_id: string | null
          unlock_at: string
          updated_at: string
        }
        Insert: {
          calendar_id: string
          content_text?: string | null
          content_type?: string
          created_at?: string
          day_index: number
          id?: string
          is_special?: boolean
          organization_id: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          target_wheel_id?: string | null
          unlock_at: string
          updated_at?: string
        }
        Update: {
          calendar_id?: string
          content_text?: string | null
          content_type?: string
          created_at?: string
          day_index?: number
          id?: string
          is_special?: boolean
          organization_id?: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number | null
          target_wheel_id?: string | null
          unlock_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_days_calendar_id_organization_id_fkey"
            columns: ["calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_days_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_days_target_wheel_id_organization_id_fkey"
            columns: ["target_wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      calendar_openings: {
        Row: {
          calendar_id: string
          code: string | null
          consumed_at: string | null
          content_type: string
          day_id: string
          id: string
          opened_at: string
          organization_id: string
          out_of_stock: boolean
          player_id: string
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          resulting_spin_id: string | null
          spin_grant_token: string | null
        }
        Insert: {
          calendar_id: string
          code?: string | null
          consumed_at?: string | null
          content_type: string
          day_id: string
          id?: string
          opened_at?: string
          organization_id: string
          out_of_stock?: boolean
          player_id: string
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          spin_grant_token?: string | null
        }
        Update: {
          calendar_id?: string
          code?: string | null
          consumed_at?: string | null
          content_type?: string
          day_id?: string
          id?: string
          opened_at?: string
          organization_id?: string
          out_of_stock?: boolean
          player_id?: string
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          spin_grant_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_openings_calendar_id_organization_id_fkey"
            columns: ["calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_openings_day_id_organization_id_fkey"
            columns: ["day_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendar_days"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_openings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_openings_player_id_calendar_id_organization_id_fkey"
            columns: ["player_id", "calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendar_players"
            referencedColumns: ["id", "calendar_id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_openings_resulting_spin_id_fkey"
            columns: ["resulting_spin_id"]
            isOneToOne: false
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_players: {
        Row: {
          calendar_id: string
          completion_rewarded: boolean
          created_at: string
          email: string | null
          id: string
          marketing_opt_in: boolean
          opened_count: number
          organization_id: string
          reminder_opt_in: boolean
          token_hash: string
        }
        Insert: {
          calendar_id: string
          completion_rewarded?: boolean
          created_at?: string
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          opened_count?: number
          organization_id: string
          reminder_opt_in?: boolean
          token_hash: string
        }
        Update: {
          calendar_id?: string
          completion_rewarded?: boolean
          created_at?: string
          email?: string | null
          id?: string
          marketing_opt_in?: boolean
          opened_count?: number
          organization_id?: string
          reminder_opt_in?: boolean
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_players_calendar_id_organization_id_fkey"
            columns: ["calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_rewards: {
        Row: {
          calendar_id: string
          code: string
          created_at: string
          id: string
          organization_id: string
          player_id: string
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
        }
        Insert: {
          calendar_id: string
          code: string
          created_at?: string
          id?: string
          organization_id: string
          player_id: string
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Update: {
          calendar_id?: string
          code?: string
          created_at?: string
          id?: string
          organization_id?: string
          player_id?: string
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "calendar_rewards_calendar_id_organization_id_fkey"
            columns: ["calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendars"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "calendar_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_rewards_player_id_calendar_id_organization_id_fkey"
            columns: ["player_id", "calendar_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "calendar_players"
            referencedColumns: ["id", "calendar_id", "organization_id"]
          },
        ]
      }
      calendars: {
        Row: {
          code_ttl_days: number | null
          completion_reward_claimed_count: number
          completion_reward_details: string | null
          completion_reward_label: string
          completion_reward_stock: number
          created_at: string
          day_count: number
          id: string
          merchant_content: string | null
          name: string
          organization_id: string
          public_slug: string
          start_date: string
          status: string
          theme: string
          timezone: string
          updated_at: string
        }
        Insert: {
          code_ttl_days?: number | null
          completion_reward_claimed_count?: number
          completion_reward_details?: string | null
          completion_reward_label?: string
          completion_reward_stock: number
          created_at?: string
          day_count: number
          id?: string
          merchant_content?: string | null
          name: string
          organization_id: string
          public_slug: string
          start_date: string
          status?: string
          theme?: string
          timezone: string
          updated_at?: string
        }
        Update: {
          code_ttl_days?: number | null
          completion_reward_claimed_count?: number
          completion_reward_details?: string | null
          completion_reward_label?: string
          completion_reward_stock?: number
          created_at?: string
          day_count?: number
          id?: string
          merchant_content?: string | null
          name?: string
          organization_id?: string
          public_slug?: string
          start_date?: string
          status?: string
          theme?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendars_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_templates: {
        Row: {
          blueprint: Json
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          organization_id: string
          source_campaign_id: string | null
          updated_at: string
        }
        Insert: {
          blueprint: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          organization_id: string
          source_campaign_id?: string | null
          updated_at?: string
        }
        Update: {
          blueprint?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          source_campaign_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_templates_source_campaign_id_organization_id_fkey"
            columns: ["source_campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
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
          prejeu_invitation: boolean
          share_enabled: boolean
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
          prejeu_invitation?: boolean
          share_enabled?: boolean
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
          prejeu_invitation?: boolean
          share_enabled?: boolean
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
          basket_cents: number | null
          code: string
          contest_id: string
          created_at: string
          id: string
          organization_id: string
          player_id: string
          rank: number
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          reward_label: string
          status: string
        }
        Insert: {
          basket_cents?: number | null
          code: string
          contest_id: string
          created_at?: string
          id?: string
          organization_id: string
          player_id: string
          rank: number
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          reward_label: string
          status?: string
        }
        Update: {
          basket_cents?: number | null
          code?: string
          contest_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          player_id?: string
          rank?: number
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
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
          correct_answer: Json | null
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
          locks_at: string | null
          options: Json | null
          organization_id: string
          position: number
          prompt: string | null
          question_type: string
          ranking_size: number | null
          status: string
        }
        Insert: {
          away_badge?: string
          away_color?: string
          away_key?: string
          away_name?: string
          away_penalties?: number | null
          away_score?: number | null
          contest_id: string
          correct_answer?: Json | null
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
          kickoff_at: string
          locks_at?: string | null
          options?: Json | null
          organization_id: string
          position?: number
          prompt?: string | null
          question_type?: string
          ranking_size?: number | null
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
          correct_answer?: Json | null
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
          locks_at?: string | null
          options?: Json | null
          organization_id?: string
          position?: number
          prompt?: string | null
          question_type?: string
          ranking_size?: number | null
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
          answer: Json | null
          away_score: number | null
          contest_id: string
          created_at: string
          home_score: number | null
          id: string
          match_id: string
          organization_id: string
          player_id: string
          points: number | null
          updated_at: string
        }
        Insert: {
          answer?: Json | null
          away_score?: number | null
          contest_id: string
          created_at?: string
          home_score?: number | null
          id?: string
          match_id: string
          organization_id: string
          player_id: string
          points?: number | null
          updated_at?: string
        }
        Update: {
          answer?: Json | null
          away_score?: number | null
          contest_id?: string
          created_at?: string
          home_score?: number | null
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
          code_ttl_seconds: number | null
          collect_email: boolean
          collect_phone: boolean
          competition_key: string
          created_at: string
          default_locks_at: string | null
          event_kind: string
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
          theme: string
          tiebreaker_answer: number | null
          tiebreaker_question: string | null
        }
        Insert: {
          code_ttl_seconds?: number | null
          collect_email?: boolean
          collect_phone?: boolean
          competition_key: string
          created_at?: string
          default_locks_at?: string | null
          event_kind?: string
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
          theme?: string
          tiebreaker_answer?: number | null
          tiebreaker_question?: string | null
        }
        Update: {
          code_ttl_seconds?: number | null
          collect_email?: boolean
          collect_phone?: boolean
          competition_key?: string
          created_at?: string
          default_locks_at?: string | null
          event_kind?: string
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
          theme?: string
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
      economic_policy_events: {
        Row: {
          created_at: string
          experience_id: string
          id: string
          observed_player_total: number | null
          observed_total: number | null
          organization_id: string
          policy_id: string
          reason: string
          source_type: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          id?: string
          observed_player_total?: number | null
          observed_total?: number | null
          organization_id: string
          policy_id: string
          reason: string
          source_type: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          id?: string
          observed_player_total?: number | null
          observed_total?: number | null
          organization_id?: string
          policy_id?: string
          reason?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "economic_policy_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "economic_policy_events_policy_id_fkey"
            columns: ["policy_id"]
            isOneToOne: false
            referencedRelation: "experience_economic_policies"
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
      event_answers: {
        Row: {
          answered_at: string
          elapsed_ms: number
          id: string
          is_correct: boolean
          option_id: string
          organization_id: string
          player_id: string
          points_awarded: number
          question_id: string
          session_id: string
        }
        Insert: {
          answered_at?: string
          elapsed_ms: number
          id?: string
          is_correct?: boolean
          option_id: string
          organization_id: string
          player_id: string
          points_awarded?: number
          question_id: string
          session_id: string
        }
        Update: {
          answered_at?: string
          elapsed_ms?: number
          id?: string
          is_correct?: boolean
          option_id?: string
          organization_id?: string
          player_id?: string
          points_awarded?: number
          question_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_answers_option_id_organization_id_fkey"
            columns: ["option_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_question_options"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "event_answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_answers_player_id_session_id_organization_id_fkey"
            columns: ["player_id", "session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_players"
            referencedColumns: ["id", "session_id", "organization_id"]
          },
          {
            foreignKeyName: "event_answers_question_id_organization_id_fkey"
            columns: ["question_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "event_answers_session_id_organization_id_fkey"
            columns: ["session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      event_games: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_games_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_players: {
        Row: {
          avatar: string
          id: string
          joined_at: string
          moderated_at: string | null
          moderated_by: string | null
          moderation_original_pseudo: string | null
          moderation_reason: string | null
          moderation_state: string
          organization_id: string
          pseudo: string
          score: number
          session_id: string
          token_hash: string
        }
        Insert: {
          avatar?: string
          id?: string
          joined_at?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_original_pseudo?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          organization_id: string
          pseudo: string
          score?: number
          session_id: string
          token_hash: string
        }
        Update: {
          avatar?: string
          id?: string
          joined_at?: string
          moderated_at?: string | null
          moderated_by?: string | null
          moderation_original_pseudo?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          organization_id?: string
          pseudo?: string
          score?: number
          session_id?: string
          token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_players_session_id_organization_id_fkey"
            columns: ["session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      event_question_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          label: string
          organization_id: string
          position: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label: string
          organization_id: string
          position: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          label?: string
          organization_id?: string
          position?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_question_options_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_question_options_question_id_organization_id_fkey"
            columns: ["question_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      event_questions: {
        Row: {
          created_at: string
          game_id: string
          id: string
          media_url: string | null
          organization_id: string
          points_base: number
          position: number
          prompt: string
          question_type: string
          time_limit_seconds: number
        }
        Insert: {
          created_at?: string
          game_id: string
          id?: string
          media_url?: string | null
          organization_id: string
          points_base?: number
          position: number
          prompt: string
          question_type?: string
          time_limit_seconds?: number
        }
        Update: {
          created_at?: string
          game_id?: string
          id?: string
          media_url?: string | null
          organization_id?: string
          points_base?: number
          position?: number
          prompt?: string
          question_type?: string
          time_limit_seconds?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_questions_game_id_organization_id_fkey"
            columns: ["game_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_games"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "event_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      event_sessions: {
        Row: {
          code_ttl_days: number | null
          created_at: string
          current_question_id: string | null
          current_question_started_at: string | null
          ended_at: string | null
          game_id: string
          id: string
          join_code: string
          label: string | null
          max_participants: number
          organization_id: string
          participant_revision: number
          phase: string
          prono_correct_option_id: string | null
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_stock: number
          started_at: string | null
          state_revision: number
          status: string
        }
        Insert: {
          code_ttl_days?: number | null
          created_at?: string
          current_question_id?: string | null
          current_question_started_at?: string | null
          ended_at?: string | null
          game_id: string
          id?: string
          join_code: string
          label?: string | null
          max_participants?: number
          organization_id: string
          participant_revision?: number
          phase?: string
          prono_correct_option_id?: string | null
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock: number
          started_at?: string | null
          state_revision?: number
          status?: string
        }
        Update: {
          code_ttl_days?: number | null
          created_at?: string
          current_question_id?: string | null
          current_question_started_at?: string | null
          ended_at?: string | null
          game_id?: string
          id?: string
          join_code?: string
          label?: string | null
          max_participants?: number
          organization_id?: string
          participant_revision?: number
          phase?: string
          prono_correct_option_id?: string | null
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_stock?: number
          started_at?: string | null
          state_revision?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_sessions_current_question_id_fkey"
            columns: ["current_question_id"]
            isOneToOne: false
            referencedRelation: "event_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_game_id_organization_id_fkey"
            columns: ["game_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_games"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "event_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_sessions_prono_correct_option_id_fkey"
            columns: ["prono_correct_option_id"]
            isOneToOne: false
            referencedRelation: "event_question_options"
            referencedColumns: ["id"]
          },
        ]
      }
      event_wins: {
        Row: {
          code: string
          created_at: string
          id: string
          organization_id: string
          rank: number
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          session_id: string
          winner_token_hash: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          organization_id: string
          rank: number
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          session_id: string
          winner_token_hash: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          organization_id?: string
          rank?: number
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          session_id?: string
          winner_token_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_wins_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_wins_session_id_organization_id_fkey"
            columns: ["session_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "event_sessions"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      experience_blueprint_applications: {
        Row: {
          blueprint_id: string
          blueprint_version: number
          created_at: string
          created_by: string | null
          id: string
          kind: string
          organization_id: string
          request_id: string
          secondary_target_id: string | null
          target_id: string
        }
        Insert: {
          blueprint_id: string
          blueprint_version: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: string
          organization_id: string
          request_id: string
          secondary_target_id?: string | null
          target_id: string
        }
        Update: {
          blueprint_id?: string
          blueprint_version?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: string
          organization_id?: string
          request_id?: string
          secondary_target_id?: string | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_blueprint_applications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_blueprint_applications_version_org_fk"
            columns: ["blueprint_id", "blueprint_version", "organization_id"]
            isOneToOne: false
            referencedRelation: "experience_blueprint_versions"
            referencedColumns: ["blueprint_id", "version", "organization_id"]
          },
        ]
      }
      experience_blueprint_versions: {
        Row: {
          assets: Json
          blueprint_id: string
          configuration: Json
          created_at: string
          created_by: string | null
          default_rewards: Json
          id: string
          organization_id: string
          publication_status: string
          published_at: string | null
          restored_from_version: number | null
          schema_version: number
          version: number
        }
        Insert: {
          assets?: Json
          blueprint_id: string
          configuration: Json
          created_at?: string
          created_by?: string | null
          default_rewards?: Json
          id?: string
          organization_id: string
          publication_status?: string
          published_at?: string | null
          restored_from_version?: number | null
          schema_version: number
          version: number
        }
        Update: {
          assets?: Json
          blueprint_id?: string
          configuration?: Json
          created_at?: string
          created_by?: string | null
          default_rewards?: Json
          id?: string
          organization_id?: string
          publication_status?: string
          published_at?: string | null
          restored_from_version?: number | null
          schema_version?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "experience_blueprint_versions_blueprint_org_fk"
            columns: ["blueprint_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "experience_blueprints"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "experience_blueprint_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_blueprints: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          kind: string
          name: string
          organization_id: string
          publication_status: string
          published_version: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind: string
          name: string
          organization_id: string
          publication_status?: string
          published_version?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          publication_status?: string
          published_version?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_blueprints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_blueprints_published_version_fk"
            columns: ["id", "published_version"]
            isOneToOne: false
            referencedRelation: "experience_blueprint_versions"
            referencedColumns: ["blueprint_id", "version"]
          },
        ]
      }
      experience_economic_policies: {
        Row: {
          created_at: string
          enforcement_mode: string
          experience_id: string
          experience_kind: string
          id: string
          max_per_player: number | null
          max_total_issued: number | null
          organization_id: string
          source_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enforcement_mode?: string
          experience_id: string
          experience_kind: string
          id?: string
          max_per_player?: number | null
          max_total_issued?: number | null
          organization_id: string
          source_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enforcement_mode?: string
          experience_id?: string
          experience_kind?: string
          id?: string
          max_per_player?: number | null
          max_total_issued?: number | null
          organization_id?: string
          source_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_economic_policies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      experience_events: {
        Row: {
          basket_cents: number | null
          campaign_id: string | null
          created_at: string
          event_name: string
          experience_id: string
          experience_kind: string
          id: number
          idempotency_key: string | null
          metadata: Json
          occurred_at: string
          organization_id: string
          player_id: string | null
          player_key: string | null
          qr_code_id: string | null
          reward_cost_cents: number | null
          reward_issuance_id: string | null
          source: string
        }
        Insert: {
          basket_cents?: number | null
          campaign_id?: string | null
          created_at?: string
          event_name: string
          experience_id: string
          experience_kind: string
          id?: never
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id: string
          player_id?: string | null
          player_key?: string | null
          qr_code_id?: string | null
          reward_cost_cents?: number | null
          reward_issuance_id?: string | null
          source?: string
        }
        Update: {
          basket_cents?: number | null
          campaign_id?: string | null
          created_at?: string
          event_name?: string
          experience_id?: string
          experience_kind?: string
          id?: never
          idempotency_key?: string | null
          metadata?: Json
          occurred_at?: string
          organization_id?: string
          player_id?: string | null
          player_key?: string | null
          qr_code_id?: string | null
          reward_cost_cents?: number | null
          reward_issuance_id?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "experience_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_events_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "experience_events_reward_issuance_id_fkey"
            columns: ["reward_issuance_id"]
            isOneToOne: false
            referencedRelation: "reward_issuances"
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
          redeem_expires_at: string | null
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
          redeem_expires_at?: string | null
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
          redeem_expires_at?: string | null
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
          code_ttl_days: number | null
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
          code_ttl_days?: number | null
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
          code_ttl_days?: number | null
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
          code_ttl_days: number | null
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
          code_ttl_days?: number | null
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
          code_ttl_days?: number | null
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
          redeem_expires_at: string | null
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
          redeem_expires_at?: string | null
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
          redeem_expires_at?: string | null
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
      loyalty_order_codes: {
        Row: {
          consumed_at: string | null
          consumed_member_id: string | null
          created_at: string
          id: string
          label: string | null
          organization_id: string
          program_id: string
          token: string
        }
        Insert: {
          consumed_at?: string | null
          consumed_member_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          organization_id: string
          program_id: string
          token: string
        }
        Update: {
          consumed_at?: string | null
          consumed_member_id?: string | null
          created_at?: string
          id?: string
          label?: string | null
          organization_id?: string
          program_id?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_order_codes_consumed_member_id_fkey"
            columns: ["consumed_member_id"]
            isOneToOne: false
            referencedRelation: "loyalty_members"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_order_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_order_codes_program_id_organization_id_fkey"
            columns: ["program_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "loyalty_programs"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      loyalty_programs: {
        Row: {
          code_ttl_days: number | null
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
          code_ttl_days?: number | null
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
          code_ttl_days?: number | null
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
          redeem_expires_at: string | null
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
          redeem_expires_at?: string | null
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
          redeem_expires_at?: string | null
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
      module_page_opens: {
        Row: {
          first_opened_at: string
          id: string
          last_opened_at: string
          module: string
          open_count: number
          organization_id: string
          resource_id: string
        }
        Insert: {
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          module: string
          open_count?: number
          organization_id: string
          resource_id: string
        }
        Update: {
          first_opened_at?: string
          id?: string
          last_opened_at?: string
          module?: string
          open_count?: number
          organization_id?: string
          resource_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "module_page_opens_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          birthday_day: number | null
          birthday_month: number | null
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
          birthday_day?: number | null
          birthday_month?: number | null
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
          birthday_day?: number | null
          birthday_month?: number | null
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
      ops_worker_definitions: {
        Row: {
          created_at: string
          enabled: boolean
          expected_period_seconds: number
          job_backlog_threshold_minutes: number | null
          tolerance_seconds: number
          vault_shared_secret: string | null
          vault_url_secret: string | null
          worker: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          expected_period_seconds: number
          job_backlog_threshold_minutes?: number | null
          tolerance_seconds: number
          vault_shared_secret?: string | null
          vault_url_secret?: string | null
          worker: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          expected_period_seconds?: number
          job_backlog_threshold_minutes?: number | null
          tolerance_seconds?: number
          vault_shared_secret?: string | null
          vault_url_secret?: string | null
          worker?: string
        }
        Relationships: []
      }
      ops_worker_runs: {
        Row: {
          completed_at: string | null
          counters: Json
          duration_ms: number | null
          error_code: string | null
          expected_at: string | null
          id: string
          lag_seconds: number | null
          started_at: string
          status: string
          worker: string
        }
        Insert: {
          completed_at?: string | null
          counters?: Json
          duration_ms?: number | null
          error_code?: string | null
          expected_at?: string | null
          id?: string
          lag_seconds?: number | null
          started_at?: string
          status?: string
          worker: string
        }
        Update: {
          completed_at?: string | null
          counters?: Json
          duration_ms?: number | null
          error_code?: string | null
          expected_at?: string | null
          id?: string
          lag_seconds?: number | null
          started_at?: string
          status?: string
          worker?: string
        }
        Relationships: [
          {
            foreignKeyName: "ops_worker_runs_worker_fkey"
            columns: ["worker"]
            isOneToOne: false
            referencedRelation: "ops_worker_definitions"
            referencedColumns: ["worker"]
          },
        ]
      }
      organization_entitlements: {
        Row: {
          active: boolean
          entitlement: string
          metadata: Json
          organization_id: string
          source: string
          source_reference: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          entitlement: string
          metadata?: Json
          organization_id: string
          source: string
          source_reference?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          entitlement?: string
          metadata?: Json
          organization_id?: string
          source?: string
          source_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_entitlements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
      organization_module_grants: {
        Row: {
          activate_by: string | null
          capacity: number | null
          created_at: string
          ends_at: string | null
          id: string
          kind: string
          module: string
          organization_id: string
          purchased_at: string
          resource_id: string | null
          revoked_at: string | null
          revoked_reason: string | null
          source: string
          source_reference: string | null
          starts_at: string | null
          updated_at: string
        }
        Insert: {
          activate_by?: string | null
          capacity?: number | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind: string
          module: string
          organization_id: string
          purchased_at?: string
          resource_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          source: string
          source_reference?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Update: {
          activate_by?: string | null
          capacity?: number | null
          created_at?: string
          ends_at?: string | null
          id?: string
          kind?: string
          module?: string
          organization_id?: string
          purchased_at?: string
          resource_id?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          source?: string
          source_reference?: string | null
          starts_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_module_grants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          addon_calendar: boolean
          addon_events: boolean
          addon_hunts: boolean
          addon_jackpot: boolean
          addon_loyalty: boolean
          addon_pronostics: boolean
          addon_quiz: boolean
          addon_referral: boolean
          addon_vitrine: boolean
          auto_reengage: boolean
          comp_access: boolean
          comp_access_note: string
          comp_access_until: string | null
          created_at: string
          data_retention_months: number | null
          google_review_url: string
          id: string
          instagram_url: string
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
          tiktok_url: string
          timezone: string
          trial_ends_at: string
          webhook_secret: string
          webhook_url: string | null
          weekly_digest: boolean
        }
        Insert: {
          addon_calendar?: boolean
          addon_events?: boolean
          addon_hunts?: boolean
          addon_jackpot?: boolean
          addon_loyalty?: boolean
          addon_pronostics?: boolean
          addon_quiz?: boolean
          addon_referral?: boolean
          addon_vitrine?: boolean
          auto_reengage?: boolean
          comp_access?: boolean
          comp_access_note?: string
          comp_access_until?: string | null
          created_at?: string
          data_retention_months?: number | null
          google_review_url?: string
          id?: string
          instagram_url?: string
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
          tiktok_url?: string
          timezone?: string
          trial_ends_at?: string
          webhook_secret?: string
          webhook_url?: string | null
          weekly_digest?: boolean
        }
        Update: {
          addon_calendar?: boolean
          addon_events?: boolean
          addon_hunts?: boolean
          addon_jackpot?: boolean
          addon_loyalty?: boolean
          addon_pronostics?: boolean
          addon_quiz?: boolean
          addon_referral?: boolean
          addon_vitrine?: boolean
          auto_reengage?: boolean
          comp_access?: boolean
          comp_access_note?: string
          comp_access_until?: string | null
          created_at?: string
          data_retention_months?: number | null
          google_review_url?: string
          id?: string
          instagram_url?: string
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
          tiktok_url?: string
          timezone?: string
          trial_ends_at?: string
          webhook_secret?: string
          webhook_url?: string | null
          weekly_digest?: boolean
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
      player_aliases: {
        Row: {
          created_at: string
          display_alias: string
          experience_id: string
          experience_kind: string
          experience_membership_id: string
          id: string
          moderated_at: string | null
          moderation_reason: string | null
          moderation_state: string
          normalized_alias: string
          organization_id: string
          player_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_alias: string
          experience_id: string
          experience_kind: string
          experience_membership_id: string
          id?: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          normalized_alias: string
          organization_id: string
          player_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_alias?: string
          experience_id?: string
          experience_kind?: string
          experience_membership_id?: string
          id?: string
          moderated_at?: string | null
          moderation_reason?: string | null
          moderation_state?: string
          normalized_alias?: string
          organization_id?: string
          player_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_aliases_experience_membership_id_player_id_organiza_fkey"
            columns: [
              "experience_membership_id",
              "player_id",
              "organization_id",
              "experience_kind",
              "experience_id",
            ]
            isOneToOne: false
            referencedRelation: "player_experience_memberships"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "experience_kind",
              "experience_id",
            ]
          },
        ]
      }
      player_devices: {
        Row: {
          created_at: string
          grace_expires_at: string | null
          id: string
          last_seen_at: string
          player_id: string
          replaced_by_device_id: string | null
          revoked_at: string | null
          token_hash: string
          token_version: number
        }
        Insert: {
          created_at?: string
          grace_expires_at?: string | null
          id?: string
          last_seen_at?: string
          player_id: string
          replaced_by_device_id?: string | null
          revoked_at?: string | null
          token_hash: string
          token_version?: number
        }
        Update: {
          created_at?: string
          grace_expires_at?: string | null
          id?: string
          last_seen_at?: string
          player_id?: string
          replaced_by_device_id?: string | null
          revoked_at?: string | null
          token_hash?: string
          token_version?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_devices_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_devices_replacement_same_player_fk"
            columns: ["replaced_by_device_id", "player_id"]
            isOneToOne: false
            referencedRelation: "player_devices"
            referencedColumns: ["id", "player_id"]
          },
        ]
      }
      player_equity_signals: {
        Row: {
          created_at: string
          experience_id: string
          experience_kind: string
          id: string
          minimum_ms: number
          observed_ms: number
          organization_id: string
          signal_type: string
          source_id: string
          source_table: string
        }
        Insert: {
          created_at?: string
          experience_id: string
          experience_kind: string
          id?: string
          minimum_ms: number
          observed_ms: number
          organization_id: string
          signal_type: string
          source_id: string
          source_table: string
        }
        Update: {
          created_at?: string
          experience_id?: string
          experience_kind?: string
          id?: string
          minimum_ms?: number
          observed_ms?: number
          organization_id?: string
          signal_type?: string
          source_id?: string
          source_table?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_equity_signals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      player_experience_memberships: {
        Row: {
          acquisition_qr_code_id: string | null
          acquisition_source: string
          experience_id: string
          experience_kind: string
          first_seen_at: string
          id: string
          last_seen_at: string
          organization_id: string
          organization_membership_id: string
          player_id: string
        }
        Insert: {
          acquisition_qr_code_id?: string | null
          acquisition_source?: string
          experience_id: string
          experience_kind: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id: string
          organization_membership_id: string
          player_id: string
        }
        Update: {
          acquisition_qr_code_id?: string | null
          acquisition_source?: string
          experience_id?: string
          experience_kind?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string
          organization_membership_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_experience_memberships_acquisition_qr_code_id_organ_fkey"
            columns: ["acquisition_qr_code_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "qr_codes"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "player_experience_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_experience_memberships_organization_membership_id_p_fkey"
            columns: [
              "organization_membership_id",
              "player_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "player_organization_memberships"
            referencedColumns: ["id", "player_id", "organization_id"]
          },
          {
            foreignKeyName: "player_experience_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_legacy_identities: {
        Row: {
          experience_id: string
          experience_kind: string
          experience_membership_id: string
          first_seen_at: string
          id: string
          last_seen_at: string
          legacy_identity_hash: string
          organization_id: string
          player_id: string
        }
        Insert: {
          experience_id: string
          experience_kind: string
          experience_membership_id: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          legacy_identity_hash: string
          organization_id: string
          player_id: string
        }
        Update: {
          experience_id?: string
          experience_kind?: string
          experience_membership_id?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          legacy_identity_hash?: string
          organization_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_legacy_identities_experience_membership_id_player_i_fkey"
            columns: [
              "experience_membership_id",
              "player_id",
              "organization_id",
              "experience_kind",
              "experience_id",
            ]
            isOneToOne: false
            referencedRelation: "player_experience_memberships"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "experience_kind",
              "experience_id",
            ]
          },
        ]
      }
      player_organization_memberships: {
        Row: {
          first_seen_at: string
          id: string
          last_seen_at: string
          organization_id: string
          player_id: string
        }
        Insert: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id: string
          player_id: string
        }
        Update: {
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          organization_id?: string
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_organization_memberships_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_organization_memberships_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          auth_user_id: string | null
          created_at: string
          id: string
          identity_consent_at: string | null
          identity_consent_version: string | null
          identity_linked_at: string | null
          last_seen_at: string
          status: string
          updated_at: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          identity_consent_at?: string | null
          identity_consent_version?: string | null
          identity_linked_at?: string | null
          last_seen_at?: string
          status?: string
          updated_at?: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          id?: string
          identity_consent_at?: string | null
          identity_consent_version?: string | null
          identity_linked_at?: string | null
          last_seen_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
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
      progression_badges: {
        Row: {
          created_at: string
          description: string
          icon_key: string
          id: string
          name: string
          organization_id: string
          season_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          icon_key?: string
          id?: string
          name: string
          organization_id: string
          season_id: string
        }
        Update: {
          created_at?: string
          description?: string
          icon_key?: string
          id?: string
          name?: string
          organization_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_badges_season_id_organization_id_fkey"
            columns: ["season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_seasons"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      progression_chest_items: {
        Row: {
          chest_id: string
          created_at: string
          item_id: string
          organization_id: string
          season_id: string
        }
        Insert: {
          chest_id: string
          created_at?: string
          item_id: string
          organization_id: string
          season_id: string
        }
        Update: {
          chest_id?: string
          created_at?: string
          item_id?: string
          organization_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_chest_items_chest_id_season_id_organization_id_fkey"
            columns: ["chest_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_chests"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_chest_items_item_id_season_id_organization_id_fkey"
            columns: ["item_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_collection_items"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
        ]
      }
      progression_chest_openings: {
        Row: {
          chest_id: string
          id: string
          item_id: string
          key_cost: number
          opened_at: string
          organization_id: string
          player_id: string
          player_season_id: string
          request_id: string
          season_id: string
        }
        Insert: {
          chest_id: string
          id?: string
          item_id: string
          key_cost: number
          opened_at?: string
          organization_id: string
          player_id: string
          player_season_id: string
          request_id: string
          season_id: string
        }
        Update: {
          chest_id?: string
          id?: string
          item_id?: string
          key_cost?: number
          opened_at?: string
          organization_id?: string
          player_id?: string
          player_season_id?: string
          request_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_chest_openings_chest_id_season_id_organization_fkey"
            columns: ["chest_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_chests"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_chest_openings_item_id_season_id_organization__fkey"
            columns: ["item_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_collection_items"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_chest_openings_player_season_id_player_id_orga_fkey"
            columns: [
              "player_season_id",
              "player_id",
              "organization_id",
              "season_id",
            ]
            isOneToOne: false
            referencedRelation: "progression_player_seasons"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "season_id",
            ]
          },
        ]
      }
      progression_chests: {
        Row: {
          created_at: string
          description: string
          enabled: boolean
          id: string
          key_cost: number
          loot_seed: string
          name: string
          organization_id: string
          season_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          key_cost: number
          loot_seed?: string
          name: string
          organization_id: string
          season_id: string
        }
        Update: {
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          key_cost?: number
          loot_seed?: string
          name?: string
          organization_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_chests_season_id_organization_id_fkey"
            columns: ["season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_seasons"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      progression_collection_items: {
        Row: {
          collection_id: string
          created_at: string
          description: string
          id: string
          image_url: string | null
          name: string
          organization_id: string
          position: number
          season_id: string
        }
        Insert: {
          collection_id: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          name: string
          organization_id: string
          position?: number
          season_id: string
        }
        Update: {
          collection_id?: string
          created_at?: string
          description?: string
          id?: string
          image_url?: string | null
          name?: string
          organization_id?: string
          position?: number
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_collection_items_collection_id_season_id_organ_fkey"
            columns: ["collection_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_collections"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
        ]
      }
      progression_collections: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          organization_id: string
          season_id: string
        }
        Insert: {
          created_at?: string
          description?: string
          id?: string
          name: string
          organization_id: string
          season_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          organization_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_collections_season_id_organization_id_fkey"
            columns: ["season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_seasons"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      progression_engine_failures: {
        Row: {
          analytics_event_id: number | null
          failed_at: string
          id: number
          message: string | null
          mission_id: string | null
          organization_id: string | null
          player_id: string | null
          season_id: string | null
          sqlstate: string | null
        }
        Insert: {
          analytics_event_id?: number | null
          failed_at?: string
          id?: never
          message?: string | null
          mission_id?: string | null
          organization_id?: string | null
          player_id?: string | null
          season_id?: string | null
          sqlstate?: string | null
        }
        Update: {
          analytics_event_id?: number | null
          failed_at?: string
          id?: never
          message?: string | null
          mission_id?: string | null
          organization_id?: string | null
          player_id?: string | null
          season_id?: string | null
          sqlstate?: string | null
        }
        Relationships: []
      }
      progression_mission_contributions: {
        Row: {
          analytics_event_id: number | null
          contributed_at: string
          contribution_key: string
          event_name: string
          experience_id: string
          experience_kind: string
          id: number
          player_season_id: string
          progress_id: string
        }
        Insert: {
          analytics_event_id?: number | null
          contributed_at?: string
          contribution_key: string
          event_name: string
          experience_id: string
          experience_kind: string
          id?: never
          player_season_id: string
          progress_id: string
        }
        Update: {
          analytics_event_id?: number | null
          contributed_at?: string
          contribution_key?: string
          event_name?: string
          experience_id?: string
          experience_kind?: string
          id?: never
          player_season_id?: string
          progress_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_mission_contribut_progress_id_player_season_id_fkey"
            columns: ["progress_id", "player_season_id"]
            isOneToOne: false
            referencedRelation: "progression_mission_progress"
            referencedColumns: ["id", "player_season_id"]
          },
          {
            foreignKeyName: "progression_mission_contributions_analytics_event_id_fkey"
            columns: ["analytics_event_id"]
            isOneToOne: false
            referencedRelation: "experience_events"
            referencedColumns: ["id"]
          },
        ]
      }
      progression_mission_progress: {
        Row: {
          completed_at: string | null
          created_at: string
          current_value: number
          id: string
          mission_id: string
          organization_id: string
          player_id: string
          player_season_id: string
          rule_version: number
          season_id: string
          target_value: number
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          id?: string
          mission_id: string
          organization_id: string
          player_id: string
          player_season_id: string
          rule_version: number
          season_id: string
          target_value: number
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          current_value?: number
          id?: string
          mission_id?: string
          organization_id?: string
          player_id?: string
          player_season_id?: string
          rule_version?: number
          season_id?: string
          target_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_mission_progress_mission_id_rule_version_seaso_fkey"
            columns: [
              "mission_id",
              "rule_version",
              "season_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "progression_mission_versions"
            referencedColumns: [
              "mission_id",
              "version",
              "season_id",
              "organization_id",
            ]
          },
          {
            foreignKeyName: "progression_mission_progress_player_season_id_player_id_or_fkey"
            columns: [
              "player_season_id",
              "player_id",
              "organization_id",
              "season_id",
            ]
            isOneToOne: false
            referencedRelation: "progression_player_seasons"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "season_id",
            ]
          },
        ]
      }
      progression_mission_versions: {
        Row: {
          created_at: string
          created_by: string | null
          mission_id: string
          organization_id: string
          rule: Json
          season_id: string
          version: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          mission_id: string
          organization_id: string
          rule: Json
          season_id: string
          version: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          mission_id?: string
          organization_id?: string
          rule?: Json
          season_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "progression_mission_versions_mission_id_season_id_organiza_fkey"
            columns: ["mission_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_missions"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
        ]
      }
      progression_missions: {
        Row: {
          active_rule_version: number
          badge_id: string | null
          collection_item_id: string | null
          created_at: string
          description: string
          enabled: boolean
          id: string
          key_reward: number
          name: string
          organization_id: string
          season_id: string
          updated_at: string
        }
        Insert: {
          active_rule_version?: number
          badge_id?: string | null
          collection_item_id?: string | null
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          key_reward?: number
          name: string
          organization_id: string
          season_id: string
          updated_at?: string
        }
        Update: {
          active_rule_version?: number
          badge_id?: string | null
          collection_item_id?: string | null
          created_at?: string
          description?: string
          enabled?: boolean
          id?: string
          key_reward?: number
          name?: string
          organization_id?: string
          season_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_missions_badge_fk"
            columns: ["badge_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_badges"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_missions_collection_item_fk"
            columns: ["collection_item_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_collection_items"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_missions_season_id_organization_id_fkey"
            columns: ["season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_seasons"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      progression_player_badges: {
        Row: {
          awarded_at: string
          badge_id: string
          id: string
          mission_id: string | null
          organization_id: string
          player_id: string
          player_season_id: string
          season_id: string
        }
        Insert: {
          awarded_at?: string
          badge_id: string
          id?: string
          mission_id?: string | null
          organization_id: string
          player_id: string
          player_season_id: string
          season_id: string
        }
        Update: {
          awarded_at?: string
          badge_id?: string
          id?: string
          mission_id?: string | null
          organization_id?: string
          player_id?: string
          player_season_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_player_badges_badge_id_season_id_organization__fkey"
            columns: ["badge_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_badges"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_player_badges_mission_id_season_id_organizatio_fkey"
            columns: ["mission_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_missions"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_player_badges_player_season_id_player_id_organ_fkey"
            columns: [
              "player_season_id",
              "player_id",
              "organization_id",
              "season_id",
            ]
            isOneToOne: false
            referencedRelation: "progression_player_seasons"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "season_id",
            ]
          },
        ]
      }
      progression_player_items: {
        Row: {
          awarded_at: string
          id: string
          item_id: string
          organization_id: string
          player_id: string
          player_season_id: string
          season_id: string
          source_id: string
          source_type: string
        }
        Insert: {
          awarded_at?: string
          id?: string
          item_id: string
          organization_id: string
          player_id: string
          player_season_id: string
          season_id: string
          source_id: string
          source_type: string
        }
        Update: {
          awarded_at?: string
          id?: string
          item_id?: string
          organization_id?: string
          player_id?: string
          player_season_id?: string
          season_id?: string
          source_id?: string
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_player_items_item_id_season_id_organization_id_fkey"
            columns: ["item_id", "season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_collection_items"
            referencedColumns: ["id", "season_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_player_items_player_season_id_player_id_organi_fkey"
            columns: [
              "player_season_id",
              "player_id",
              "organization_id",
              "season_id",
            ]
            isOneToOne: false
            referencedRelation: "progression_player_seasons"
            referencedColumns: [
              "id",
              "player_id",
              "organization_id",
              "season_id",
            ]
          },
        ]
      }
      progression_player_seasons: {
        Row: {
          first_progress_at: string
          id: string
          keys_balance: number
          keys_earned: number
          keys_spent: number
          last_progress_at: string
          organization_id: string
          organization_membership_id: string
          player_id: string
          season_id: string
        }
        Insert: {
          first_progress_at?: string
          id?: string
          keys_balance?: number
          keys_earned?: number
          keys_spent?: number
          last_progress_at?: string
          organization_id: string
          organization_membership_id: string
          player_id: string
          season_id: string
        }
        Update: {
          first_progress_at?: string
          id?: string
          keys_balance?: number
          keys_earned?: number
          keys_spent?: number
          last_progress_at?: string
          organization_id?: string
          organization_membership_id?: string
          player_id?: string
          season_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_player_seasons_organization_membership_id_play_fkey"
            columns: [
              "organization_membership_id",
              "player_id",
              "organization_id",
            ]
            isOneToOne: false
            referencedRelation: "player_organization_memberships"
            referencedColumns: ["id", "player_id", "organization_id"]
          },
          {
            foreignKeyName: "progression_player_seasons_season_id_organization_id_fkey"
            columns: ["season_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "progression_seasons"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      progression_seasons: {
        Row: {
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          name: string
          organization_id: string
          starts_at: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          name: string
          organization_id: string
          starts_at: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          name?: string
          organization_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "progression_seasons_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
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
      quiz_answers: {
        Row: {
          answer: Json | null
          answered_at: string | null
          elapsed_ms: number | null
          id: string
          is_correct: boolean | null
          organization_id: string
          player_id: string
          points_awarded: number | null
          question_id: string
          quiz_id: string
          started_at: string
          timed_out: boolean
        }
        Insert: {
          answer?: Json | null
          answered_at?: string | null
          elapsed_ms?: number | null
          id?: string
          is_correct?: boolean | null
          organization_id: string
          player_id: string
          points_awarded?: number | null
          question_id: string
          quiz_id: string
          started_at?: string
          timed_out?: boolean
        }
        Update: {
          answer?: Json | null
          answered_at?: string | null
          elapsed_ms?: number | null
          id?: string
          is_correct?: boolean | null
          organization_id?: string
          player_id?: string
          points_awarded?: number | null
          question_id?: string
          quiz_id?: string
          started_at?: string
          timed_out?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "quiz_answers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_answers_player_id_quiz_id_organization_id_fkey"
            columns: ["player_id", "quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quiz_players"
            referencedColumns: ["id", "quiz_id", "organization_id"]
          },
          {
            foreignKeyName: "quiz_answers_question_id_organization_id_fkey"
            columns: ["question_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quiz_questions"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quiz_answers_quiz_id_organization_id_fkey"
            columns: ["quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      quiz_players: {
        Row: {
          avatar: string
          correct_count: number
          created_at: string
          email: string | null
          finished_at: string | null
          first_name: string | null
          id: string
          marketing_opt_in: boolean
          organization_id: string
          quiz_id: string
          score: number
          token_hash: string
          total_elapsed_ms: number
        }
        Insert: {
          avatar?: string
          correct_count?: number
          created_at?: string
          email?: string | null
          finished_at?: string | null
          first_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          organization_id: string
          quiz_id: string
          score?: number
          token_hash: string
          total_elapsed_ms?: number
        }
        Update: {
          avatar?: string
          correct_count?: number
          created_at?: string
          email?: string | null
          finished_at?: string | null
          first_name?: string | null
          id?: string
          marketing_opt_in?: boolean
          organization_id?: string
          quiz_id?: string
          score?: number
          token_hash?: string
          total_elapsed_ms?: number
        }
        Relationships: [
          {
            foreignKeyName: "quiz_players_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_players_quiz_id_organization_id_fkey"
            columns: ["quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      quiz_questions: {
        Row: {
          correct_answer: Json
          created_at: string
          id: string
          image_url: string | null
          options: Json | null
          organization_id: string
          points: number
          position: number
          preset: string
          prompt: string
          question_type: string
          quiz_id: string
          ranking_size: number | null
          time_limit_seconds: number | null
          tolerance: number | null
          updated_at: string
        }
        Insert: {
          correct_answer: Json
          created_at?: string
          id?: string
          image_url?: string | null
          options?: Json | null
          organization_id: string
          points?: number
          position: number
          preset?: string
          prompt: string
          question_type?: string
          quiz_id: string
          ranking_size?: number | null
          time_limit_seconds?: number | null
          tolerance?: number | null
          updated_at?: string
        }
        Update: {
          correct_answer?: Json
          created_at?: string
          id?: string
          image_url?: string | null
          options?: Json | null
          organization_id?: string
          points?: number
          position?: number
          preset?: string
          prompt?: string
          question_type?: string
          quiz_id?: string
          ranking_size?: number | null
          time_limit_seconds?: number | null
          tolerance?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quiz_questions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_questions_quiz_id_organization_id_fkey"
            columns: ["quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      quiz_rewards: {
        Row: {
          code: string | null
          consumed_at: string | null
          created_at: string
          id: string
          organization_id: string
          out_of_stock: boolean
          player_id: string
          quiz_id: string
          rank: number | null
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          resulting_spin_id: string | null
          source: string
          spin_grant_token: string | null
        }
        Insert: {
          code?: string | null
          consumed_at?: string | null
          created_at?: string
          id?: string
          organization_id: string
          out_of_stock?: boolean
          player_id: string
          quiz_id: string
          rank?: number | null
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          source: string
          spin_grant_token?: string | null
        }
        Update: {
          code?: string | null
          consumed_at?: string | null
          created_at?: string
          id?: string
          organization_id?: string
          out_of_stock?: boolean
          player_id?: string
          quiz_id?: string
          rank?: number | null
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          source?: string
          spin_grant_token?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "quiz_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quiz_rewards_player_id_quiz_id_organization_id_fkey"
            columns: ["player_id", "quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quiz_players"
            referencedColumns: ["id", "quiz_id", "organization_id"]
          },
          {
            foreignKeyName: "quiz_rewards_quiz_id_organization_id_fkey"
            columns: ["quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "quiz_rewards_resulting_spin_id_fkey"
            columns: ["resulting_spin_id"]
            isOneToOne: false
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
        ]
      }
      quizzes: {
        Row: {
          code_ttl_days: number | null
          created_at: string
          draw_state: string
          draw_top_n: number | null
          drawn_at: string | null
          id: string
          intro_text: string | null
          name: string
          organization_id: string
          public_slug: string
          reward_claimed_count: number
          reward_details: string | null
          reward_label: string
          reward_mode: string
          reward_stock: number
          reward_threshold: number | null
          share_enabled: boolean
          status: string
          target_wheel_id: string | null
          theme: string
          updated_at: string
        }
        Insert: {
          code_ttl_days?: number | null
          created_at?: string
          draw_state?: string
          draw_top_n?: number | null
          drawn_at?: string | null
          id?: string
          intro_text?: string | null
          name: string
          organization_id: string
          public_slug: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_mode?: string
          reward_stock?: number
          reward_threshold?: number | null
          share_enabled?: boolean
          status?: string
          target_wheel_id?: string | null
          theme?: string
          updated_at?: string
        }
        Update: {
          code_ttl_days?: number | null
          created_at?: string
          draw_state?: string
          draw_top_n?: number | null
          drawn_at?: string | null
          id?: string
          intro_text?: string | null
          name?: string
          organization_id?: string
          public_slug?: string
          reward_claimed_count?: number
          reward_details?: string | null
          reward_label?: string
          reward_mode?: string
          reward_stock?: number
          reward_threshold?: number | null
          share_enabled?: boolean
          status?: string
          target_wheel_id?: string | null
          theme?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quizzes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quizzes_target_wheel_id_organization_id_fkey"
            columns: ["target_wheel_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "wheels"
            referencedColumns: ["id", "organization_id"]
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
      referral_programs: {
        Row: {
          campaign_id: string
          chest_reward_claimed_count: number
          chest_reward_details: string | null
          chest_reward_kind: string
          chest_reward_label: string
          chest_reward_stock: number | null
          chest_threshold: number
          code_ttl_days: number | null
          created_at: string
          enabled: boolean
          filleul_reward_claimed_count: number
          filleul_reward_details: string | null
          filleul_reward_kind: string
          filleul_reward_label: string
          filleul_reward_stock: number | null
          id: string
          organization_id: string
          sponsor_max_filleuls: number
          sponsor_reward_claimed_count: number
          sponsor_reward_details: string | null
          sponsor_reward_kind: string
          sponsor_reward_label: string
          sponsor_reward_stock: number | null
          updated_at: string
          window_days: number
        }
        Insert: {
          campaign_id: string
          chest_reward_claimed_count?: number
          chest_reward_details?: string | null
          chest_reward_kind?: string
          chest_reward_label?: string
          chest_reward_stock?: number | null
          chest_threshold?: number
          code_ttl_days?: number | null
          created_at?: string
          enabled?: boolean
          filleul_reward_claimed_count?: number
          filleul_reward_details?: string | null
          filleul_reward_kind?: string
          filleul_reward_label?: string
          filleul_reward_stock?: number | null
          id?: string
          organization_id: string
          sponsor_max_filleuls?: number
          sponsor_reward_claimed_count?: number
          sponsor_reward_details?: string | null
          sponsor_reward_kind?: string
          sponsor_reward_label?: string
          sponsor_reward_stock?: number | null
          updated_at?: string
          window_days?: number
        }
        Update: {
          campaign_id?: string
          chest_reward_claimed_count?: number
          chest_reward_details?: string | null
          chest_reward_kind?: string
          chest_reward_label?: string
          chest_reward_stock?: number | null
          chest_threshold?: number
          code_ttl_days?: number | null
          created_at?: string
          enabled?: boolean
          filleul_reward_claimed_count?: number
          filleul_reward_details?: string | null
          filleul_reward_kind?: string
          filleul_reward_label?: string
          filleul_reward_stock?: number | null
          id?: string
          organization_id?: string
          sponsor_max_filleuls?: number
          sponsor_reward_claimed_count?: number
          sponsor_reward_details?: string | null
          sponsor_reward_kind?: string
          sponsor_reward_label?: string
          sponsor_reward_stock?: number | null
          updated_at?: string
          window_days?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_programs_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "referral_programs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      referral_rewards: {
        Row: {
          beneficiary: string
          campaign_id: string
          code: string | null
          created_at: string
          grant_consumed_at: string | null
          id: string
          kind: string
          organization_id: string
          out_of_stock: boolean
          redeem_expires_at: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          resulting_spin_id: string | null
          signup_id: string | null
          spin_grant_token: string | null
          sponsor_id: string | null
        }
        Insert: {
          beneficiary: string
          campaign_id: string
          code?: string | null
          created_at?: string
          grant_consumed_at?: string | null
          id?: string
          kind: string
          organization_id: string
          out_of_stock?: boolean
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          signup_id?: string | null
          spin_grant_token?: string | null
          sponsor_id?: string | null
        }
        Update: {
          beneficiary?: string
          campaign_id?: string
          code?: string | null
          created_at?: string
          grant_consumed_at?: string | null
          id?: string
          kind?: string
          organization_id?: string
          out_of_stock?: boolean
          redeem_expires_at?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          resulting_spin_id?: string | null
          signup_id?: string | null
          spin_grant_token?: string | null
          sponsor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "referral_rewards_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "referral_rewards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_resulting_spin_id_fkey"
            columns: ["resulting_spin_id"]
            isOneToOne: false
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_rewards_signup_id_organization_id_fkey"
            columns: ["signup_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "referral_signups"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "referral_rewards_sponsor_id_organization_id_fkey"
            columns: ["sponsor_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "referral_sponsors"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      referral_signups: {
        Row: {
          campaign_id: string
          created_at: string
          filleul_email: string | null
          filleul_key: string
          id: string
          organization_id: string
          proof_spin_id: string
          sponsor_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          filleul_email?: string | null
          filleul_key: string
          id?: string
          organization_id: string
          proof_spin_id: string
          sponsor_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          filleul_email?: string | null
          filleul_key?: string
          id?: string
          organization_id?: string
          proof_spin_id?: string
          sponsor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "referral_signups_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "referral_signups_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_signups_proof_spin_id_fkey"
            columns: ["proof_spin_id"]
            isOneToOne: true
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "referral_signups_sponsor_id_campaign_id_organization_id_fkey"
            columns: ["sponsor_id", "campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "referral_sponsors"
            referencedColumns: ["id", "campaign_id", "organization_id"]
          },
        ]
      }
      referral_sponsors: {
        Row: {
          campaign_id: string
          chest_rewarded: boolean
          created_at: string
          id: string
          organization_id: string
          referral_code: string
          sponsor_email: string | null
          sponsor_key: string
          validated_count: number
        }
        Insert: {
          campaign_id: string
          chest_rewarded?: boolean
          created_at?: string
          id?: string
          organization_id: string
          referral_code: string
          sponsor_email?: string | null
          sponsor_key: string
          validated_count?: number
        }
        Update: {
          campaign_id?: string
          chest_rewarded?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          referral_code?: string
          sponsor_email?: string | null
          sponsor_key?: string
          validated_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "referral_sponsors_campaign_id_organization_id_fkey"
            columns: ["campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "referral_sponsors_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_activities: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          duration_minutes: number | null
          id: string
          kind: string
          name: string
          organization_id: string
          preparation: string | null
          promise: string | null
          steps: Json | null
          updated_at: string
          wait_pause_campaign_id: string | null
          wait_quiz_id: string | null
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: string
          name: string
          organization_id: string
          preparation?: string | null
          promise?: string | null
          steps?: Json | null
          updated_at?: string
          wait_pause_campaign_id?: string | null
          wait_quiz_id?: string | null
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          preparation?: string | null
          promise?: string | null
          steps?: Json | null
          updated_at?: string
          wait_pause_campaign_id?: string | null
          wait_quiz_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_activities_wait_pause_campaign_fkey"
            columns: ["wait_pause_campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_activities_wait_quiz_fkey"
            columns: ["wait_quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservation_invitations: {
        Row: {
          activity_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string
          max_uses: number
          organization_id: string
          revoked_at: string | null
          slot_id: string | null
          token_hash: string
          used_count: number
        }
        Insert: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label: string
          max_uses?: number
          organization_id: string
          revoked_at?: string | null
          slot_id?: string | null
          token_hash: string
          used_count?: number
        }
        Update: {
          activity_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string
          max_uses?: number
          organization_id?: string
          revoked_at?: string | null
          slot_id?: string | null
          token_hash?: string
          used_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "reservation_invitations_activity_id_organization_id_fkey"
            columns: ["activity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_activities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_invitations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_invitations_slot_id_organization_id_fkey"
            columns: ["slot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_slots"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservation_queue_entries: {
        Row: {
          called_at: string | null
          consent_transactional_at: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          organization_id: string
          player_key_hash: string
          queue_id: string
          resolved_at: string | null
          status: string
        }
        Insert: {
          called_at?: string | null
          consent_transactional_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id: string
          player_key_hash: string
          queue_id: string
          resolved_at?: string | null
          status?: string
        }
        Update: {
          called_at?: string | null
          consent_transactional_at?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          organization_id?: string
          player_key_hash?: string
          queue_id?: string
          resolved_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_queue_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_queue_entries_queue_id_organization_id_fkey"
            columns: ["queue_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_queues"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservation_queues: {
        Row: {
          activity_id: string | null
          created_at: string
          id: string
          max_live_entries: number
          name: string
          organization_id: string
          status: string
          wait_pause_campaign_id: string | null
          wait_quiz_id: string | null
        }
        Insert: {
          activity_id?: string | null
          created_at?: string
          id?: string
          max_live_entries?: number
          name: string
          organization_id: string
          status?: string
          wait_pause_campaign_id?: string | null
          wait_quiz_id?: string | null
        }
        Update: {
          activity_id?: string | null
          created_at?: string
          id?: string
          max_live_entries?: number
          name?: string
          organization_id?: string
          status?: string
          wait_pause_campaign_id?: string | null
          wait_quiz_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_queues_activity_id_organization_id_fkey"
            columns: ["activity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_activities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_queues_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_queues_wait_pause_campaign_fkey"
            columns: ["wait_pause_campaign_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_queues_wait_quiz_fkey"
            columns: ["wait_quiz_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "quizzes"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservation_slots: {
        Row: {
          activity_id: string
          capacity: number
          created_at: string
          ends_at: string
          id: string
          organization_id: string
          starts_at: string
          status: string
          updated_at: string
          waitlist_offer_minutes: number | null
        }
        Insert: {
          activity_id: string
          capacity: number
          created_at?: string
          ends_at: string
          id?: string
          organization_id: string
          starts_at: string
          status?: string
          updated_at?: string
          waitlist_offer_minutes?: number | null
        }
        Update: {
          activity_id?: string
          capacity?: number
          created_at?: string
          ends_at?: string
          id?: string
          organization_id?: string
          starts_at?: string
          status?: string
          updated_at?: string
          waitlist_offer_minutes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_slots_activity_id_organization_id_fkey"
            columns: ["activity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_activities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_slots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_stock_holds: {
        Row: {
          basket_cents: number | null
          cancelled_at: string | null
          code: string
          consent_transactional_at: string | null
          created_at: string
          email: string | null
          id: string
          offer_id: string
          organization_id: string
          player_key_hash: string
          redeem_expires_at: string
          redeem_not_before: string
          redeemed_at: string | null
          redeemed_by: string | null
          status: string
        }
        Insert: {
          basket_cents?: number | null
          cancelled_at?: string | null
          code: string
          consent_transactional_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          offer_id: string
          organization_id: string
          player_key_hash: string
          redeem_expires_at: string
          redeem_not_before: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
        }
        Update: {
          basket_cents?: number | null
          cancelled_at?: string | null
          code?: string
          consent_transactional_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          offer_id?: string
          organization_id?: string
          player_key_hash?: string
          redeem_expires_at?: string
          redeem_not_before?: string
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_stock_holds_offer_id_organization_id_fkey"
            columns: ["offer_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_stock_offers"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_stock_holds_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_stock_offers: {
        Row: {
          created_at: string
          description: string | null
          id: string
          organization_id: string
          per_player_limit: number
          status: string
          stock_total: number
          title: string
          updated_at: string
          window_ends_at: string
          window_starts_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id: string
          per_player_limit?: number
          status?: string
          stock_total: number
          title: string
          updated_at?: string
          window_ends_at: string
          window_starts_at: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          organization_id?: string
          per_player_limit?: number
          status?: string
          stock_total?: number
          title?: string
          updated_at?: string
          window_ends_at?: string
          window_starts_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_stock_offers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      reservation_wait_sessions: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          pause_chance_used_at: string | null
          pause_resulting_spin_id: string | null
          pause_spin_consumed_at: string | null
          pause_spin_grant_token: string | null
          player_key_hash: string
          queue_entry_id: string | null
          reservation_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          pause_chance_used_at?: string | null
          pause_resulting_spin_id?: string | null
          pause_spin_consumed_at?: string | null
          pause_spin_grant_token?: string | null
          player_key_hash: string
          queue_entry_id?: string | null
          reservation_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          pause_chance_used_at?: string | null
          pause_resulting_spin_id?: string | null
          pause_spin_consumed_at?: string | null
          pause_spin_grant_token?: string | null
          player_key_hash?: string
          queue_entry_id?: string | null
          reservation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reservation_wait_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_wait_sessions_pause_resulting_spin_id_fkey"
            columns: ["pause_resulting_spin_id"]
            isOneToOne: false
            referencedRelation: "spins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_wait_sessions_queue_entry_id_organization_id_fkey"
            columns: ["queue_entry_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_queue_entries"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_wait_sessions_reservation_id_organization_id_fkey"
            columns: ["reservation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservation_waitlist_entries: {
        Row: {
          cancelled_at: string | null
          consent_transactional_at: string | null
          converted_at: string | null
          converted_reservation_id: string | null
          created_at: string
          email: string | null
          expired_at: string | null
          id: string
          offer_expires_at: string | null
          offered_at: string | null
          organization_id: string
          player_key_hash: string
          slot_id: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          consent_transactional_at?: string | null
          converted_at?: string | null
          converted_reservation_id?: string | null
          created_at?: string
          email?: string | null
          expired_at?: string | null
          id?: string
          offer_expires_at?: string | null
          offered_at?: string | null
          organization_id: string
          player_key_hash: string
          slot_id: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          consent_transactional_at?: string | null
          converted_at?: string | null
          converted_reservation_id?: string | null
          created_at?: string
          email?: string | null
          expired_at?: string | null
          id?: string
          offer_expires_at?: string | null
          offered_at?: string | null
          organization_id?: string
          player_key_hash?: string
          slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservation_waitlist_entries_converted_reservation_id_orga_fkey"
            columns: ["converted_reservation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "reservation_waitlist_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservation_waitlist_entries_slot_id_organization_id_fkey"
            columns: ["slot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_slots"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reservations: {
        Row: {
          cancelled_at: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          code: string
          consent_transactional_at: string | null
          created_at: string
          email: string | null
          id: string
          organization_id: string
          party_size: number
          player_key_hash: string
          slot_id: string
          status: string
        }
        Insert: {
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          code: string
          consent_transactional_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          organization_id: string
          party_size?: number
          player_key_hash: string
          slot_id: string
          status?: string
        }
        Update: {
          cancelled_at?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          code?: string
          consent_transactional_at?: string | null
          created_at?: string
          email?: string | null
          id?: string
          organization_id?: string
          party_size?: number
          player_key_hash?: string
          slot_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_slot_id_organization_id_fkey"
            columns: ["slot_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "reservation_slots"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      reward_issuances: {
        Row: {
          basket_cents: number | null
          cancelled_at: string | null
          cancelled_reason: string | null
          cancelled_source: string | null
          code: string | null
          created_at: string
          experience_id: string | null
          expires_at: string | null
          id: string
          issued_at: string
          label: string
          metadata: Json
          organization_id: string
          player_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          reward_definition_id: string | null
          source_id: string
          source_type: string
          updated_at: string
          wallet_metadata: Json
          wallet_status: string
          wallet_updated_at: string | null
        }
        Insert: {
          basket_cents?: number | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cancelled_source?: string | null
          code?: string | null
          created_at?: string
          experience_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at: string
          label?: string
          metadata?: Json
          organization_id: string
          player_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          reward_definition_id?: string | null
          source_id: string
          source_type: string
          updated_at?: string
          wallet_metadata?: Json
          wallet_status?: string
          wallet_updated_at?: string | null
        }
        Update: {
          basket_cents?: number | null
          cancelled_at?: string | null
          cancelled_reason?: string | null
          cancelled_source?: string | null
          code?: string | null
          created_at?: string
          experience_id?: string | null
          expires_at?: string | null
          id?: string
          issued_at?: string
          label?: string
          metadata?: Json
          organization_id?: string
          player_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          reward_definition_id?: string | null
          source_id?: string
          source_type?: string
          updated_at?: string
          wallet_metadata?: Json
          wallet_status?: string
          wallet_updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reward_issuances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reward_issuances_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_consents: {
        Row: {
          consent_source: string | null
          consent_version: string
          consented_at: string
          created_at: string
          id: string
          organization_id: string
          phone: string
          phone_key: string | null
          revoked_at: string | null
          revoked_reason: string | null
          updated_at: string
        }
        Insert: {
          consent_source?: string | null
          consent_version: string
          consented_at?: string
          created_at?: string
          id?: string
          organization_id: string
          phone: string
          phone_key?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Update: {
          consent_source?: string | null
          consent_version?: string
          consented_at?: string
          created_at?: string
          id?: string
          organization_id?: string
          phone?: string
          phone_key?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_consents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_credit_entries: {
        Row: {
          created_at: string
          currency: string
          delta_units: number
          destination_country: string | null
          id: string
          organization_id: string
          reason: string
          reference: string | null
          reverses_entry_id: string | null
          unit_cost_micros: number
        }
        Insert: {
          created_at?: string
          currency: string
          delta_units: number
          destination_country?: string | null
          id?: string
          organization_id: string
          reason: string
          reference?: string | null
          reverses_entry_id?: string | null
          unit_cost_micros: number
        }
        Update: {
          created_at?: string
          currency?: string
          delta_units?: number
          destination_country?: string | null
          id?: string
          organization_id?: string
          reason?: string
          reference?: string | null
          reverses_entry_id?: string | null
          unit_cost_micros?: number
        }
        Relationships: [
          {
            foreignKeyName: "sms_credit_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_credit_entries_reverses_entry_id_fkey"
            columns: ["reverses_entry_id"]
            isOneToOne: false
            referencedRelation: "sms_credit_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_credits: {
        Row: {
          balance_units: number
          created_at: string
          currency: string
          organization_id: string
          unit_cost_micros: number
          updated_at: string
        }
        Insert: {
          balance_units?: number
          created_at?: string
          currency?: string
          organization_id: string
          unit_cost_micros?: number
          updated_at?: string
        }
        Update: {
          balance_units?: number
          created_at?: string
          currency?: string
          organization_id?: string
          unit_cost_micros?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_credits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_log: {
        Row: {
          attempts: number
          claimed_at: string
          created_at: string
          credit_entry_id: string | null
          dedup_key: string
          id: string
          last_error: string | null
          organization_id: string
          provider_message_id: string | null
          recipient: string
          recipient_key: string | null
          refunded_at: string | null
          scenario: string
          segments: number
          sender_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string
          created_at?: string
          credit_entry_id?: string | null
          dedup_key: string
          id?: string
          last_error?: string | null
          organization_id: string
          provider_message_id?: string | null
          recipient: string
          recipient_key?: string | null
          refunded_at?: string | null
          scenario: string
          segments?: number
          sender_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string
          created_at?: string
          credit_entry_id?: string | null
          dedup_key?: string
          id?: string
          last_error?: string | null
          organization_id?: string
          provider_message_id?: string | null
          recipient?: string
          recipient_key?: string | null
          refunded_at?: string | null
          scenario?: string
          segments?: number
          sender_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_log_credit_entry_id_fkey"
            columns: ["credit_entry_id"]
            isOneToOne: false
            referencedRelation: "sms_credit_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sms_log_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sms_senders: {
        Row: {
          af2m_reference: string | null
          created_at: string
          declared_at: string | null
          id: string
          organization_id: string
          retired_at: string | null
          sender_id: string
          status: string
          status_reason: string | null
          updated_at: string
        }
        Insert: {
          af2m_reference?: string | null
          created_at?: string
          declared_at?: string | null
          id?: string
          organization_id: string
          retired_at?: string | null
          sender_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Update: {
          af2m_reference?: string | null
          created_at?: string
          declared_at?: string | null
          id?: string
          organization_id?: string
          retired_at?: string | null
          sender_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sms_senders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      spins: {
        Row: {
          campaign_id: string
          claimed: boolean
          created_at: string
          engagement_action: string | null
          id: string
          idempotency_key: string | null
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
          idempotency_key?: string | null
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
          idempotency_key?: string | null
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
      vitrine_categories: {
        Row: {
          created_at: string
          id: string
          menu_id: string
          nom: string
          ordre: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          menu_id: string
          nom: string
          ordre?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          menu_id?: string
          nom?: string
          ordre?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_categories_menu_id_organization_id_fkey"
            columns: ["menu_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "vitrine_menus"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "vitrine_categories_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vitrine_items: {
        Row: {
          allergenes: string[]
          badges: string[]
          categorie_id: string
          created_at: string
          description: string | null
          disponible: boolean
          id: string
          nom: string
          ordre: number
          organization_id: string
          photo_path: string | null
          prix_affiche: string | null
          updated_at: string
        }
        Insert: {
          allergenes?: string[]
          badges?: string[]
          categorie_id: string
          created_at?: string
          description?: string | null
          disponible?: boolean
          id?: string
          nom: string
          ordre?: number
          organization_id: string
          photo_path?: string | null
          prix_affiche?: string | null
          updated_at?: string
        }
        Update: {
          allergenes?: string[]
          badges?: string[]
          categorie_id?: string
          created_at?: string
          description?: string | null
          disponible?: boolean
          id?: string
          nom?: string
          ordre?: number
          organization_id?: string
          photo_path?: string | null
          prix_affiche?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_items_categorie_id_organization_id_fkey"
            columns: ["categorie_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "vitrine_categories"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "vitrine_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vitrine_menus: {
        Row: {
          active: boolean
          created_at: string
          id: string
          nom: string
          ordre: number
          organization_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          nom: string
          ordre?: number
          organization_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          nom?: string
          ordre?: number
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_menus_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vitrine_settings: {
        Row: {
          accroche: string | null
          cover_path: string | null
          created_at: string
          histoire: string | null
          horaires_texte: string | null
          id: string
          organization_id: string
          published: boolean
          slug: string
          theme: Json
          updated_at: string
        }
        Insert: {
          accroche?: string | null
          cover_path?: string | null
          created_at?: string
          histoire?: string | null
          horaires_texte?: string | null
          id?: string
          organization_id: string
          published?: boolean
          slug: string
          theme?: Json
          updated_at?: string
        }
        Update: {
          accroche?: string | null
          cover_path?: string | null
          created_at?: string
          histoire?: string | null
          horaires_texte?: string | null
          id?: string
          organization_id?: string
          published?: boolean
          slug?: string
          theme?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: true
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      vitrine_translations: {
        Row: {
          champ: string
          cible_id: string
          cible_type: string
          created_at: string
          id: string
          lang: string
          organization_id: string
          texte: string
          version_source: string
        }
        Insert: {
          champ: string
          cible_id: string
          cible_type: string
          created_at?: string
          id?: string
          lang: string
          organization_id: string
          texte: string
          version_source: string
        }
        Update: {
          champ?: string
          cible_id?: string
          cible_type?: string
          created_at?: string
          id?: string
          lang?: string
          organization_id?: string
          texte?: string
          version_source?: string
        }
        Relationships: [
          {
            foreignKeyName: "vitrine_translations_organization_id_fkey"
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
          skill_config: Json | null
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
          skill_config?: Json | null
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
          skill_config?: Json | null
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
      activate_module_grant: {
        Args: {
          p_ends_at: string
          p_grant_id: string
          p_now?: string
          p_organization_id: string
          p_starts_at: string
        }
        Returns: {
          activated: boolean
          state: string
        }[]
      }
      activate_progression_season: {
        Args: { p_organization_id: string; p_season_id: string }
        Returns: boolean
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
      append_experience_event_internal: {
        Args: {
          p_event_name: string
          p_experience_id: string
          p_experience_kind: string
          p_idempotency_key: string
          p_occurred_at?: string
          p_organization_id: string
          p_player_id: string
          p_player_key: string
          p_qr_code_id: string
          p_source: string
        }
        Returns: undefined
      }
      applied_migrations_info: {
        Args: never
        Returns: {
          latest: string
          total: number
        }[]
      }
      apply_experience_blueprint_version: {
        Args: {
          p_actor_id: string
          p_blueprint_id: string
          p_organization_id: string
          p_request_id: string
          p_version: number
        }
        Returns: {
          kind: string
          secondary_target_id: string
          target_id: string
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
      apply_stripe_subscription_event_v2: {
        Args: {
          p_customer_id: string
          p_entitlements: string[]
          p_event_created_at: string
          p_event_id: string
          p_plan_id: string
          p_price_ids: string[]
          p_status: string
          p_subscription_id: string
          p_trial_ends_at: string
        }
        Returns: {
          applied: boolean
          duplicate: boolean
          organization_id: string
        }[]
      }
      archive_progression_season: {
        Args: { p_organization_id: string; p_season_id: string }
        Returns: boolean
      }
      assert_experience_blueprint_editor: {
        Args: { p_actor_id: string; p_organization_id: string }
        Returns: undefined
      }
      assert_module_publish_allowed:
        | {
            Args: { p_module: string; p_organization_id: string }
            Returns: undefined
          }
        | {
            Args: {
              p_module: string
              p_organization_id: string
              p_resource_id: string
            }
            Returns: undefined
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
      calendar_public_state: {
        Args: { p_calendar_id: string; p_player_token_hash?: string }
        Returns: Json
      }
      calendar_reminder_targets: {
        Args: { p_organization_id?: string }
        Returns: {
          calendar_id: string
          calendar_name: string
          day_id: string
          day_index: number
          email: string
          organization_id: string
          player_id: string
          public_slug: string
          theme: string
          unlock_at: string
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
      cancel_reservation: {
        Args: { p_player_key_hash: string; p_reservation_id: string }
        Returns: Json
      }
      cancel_reservation_staff: {
        Args: {
          p_actor: string
          p_organization_id: string
          p_reservation_id: string
        }
        Returns: Json
      }
      cancel_stock_hold: {
        Args: { p_hold_id: string; p_player_key_hash: string }
        Returns: Json
      }
      check_rate_limit: {
        Args: { p_bucket: string; p_limit: number; p_window_seconds: number }
        Returns: boolean
      }
      checkin_reservation: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          activity_name: string
          cancelled_at: string
          checked_in_at: string
          checked_in_now: boolean
          code: string
          ends_at: string
          id: string
          starts_at: string
          status: string
          window_state: string
        }[]
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
      claim_sms_delivery: {
        Args: {
          p_dedup_key: string
          p_destination_country?: string
          p_organization_id: string
          p_recipient: string
          p_scenario: string
          p_segments?: number
          p_stale_after_seconds?: number
        }
        Returns: boolean
      }
      claim_waitlist_offer: {
        Args: {
          p_entry_id: string
          p_organization_id: string
          p_player_key_hash: string
        }
        Returns: Json
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
      close_reservation_invitation: {
        Args: {
          p_actor: string
          p_invitation_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      consume_calendar_spin_grant: {
        Args: {
          p_calendar_id: string
          p_grant_token: string
          p_player_token_hash: string
        }
        Returns: Json
      }
      consume_loyalty_spin_grant: {
        Args: {
          p_grant_token: string
          p_member_token_hash: string
          p_program_id: string
        }
        Returns: Json
      }
      consume_quiz_spin_grant: {
        Args: {
          p_grant_token: string
          p_player_token_hash: string
          p_quiz_id: string
        }
        Returns: Json
      }
      consume_referral_spin_grant: {
        Args: { p_campaign_id: string; p_grant_token: string; p_key: string }
        Returns: Json
      }
      consume_reserver_wait_spin_grant: {
        Args: {
          p_grant_token: string
          p_player_key_hash: string
          p_session_id: string
        }
        Returns: Json
      }
      contest_generic_points: {
        Args: {
          p_answer: Json
          p_correct_answer: Json
          p_question_type: string
          p_scoring: Json
        }
        Returns: number
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
      contest_scoring_points: {
        Args: { p_default: number; p_key: string; p_scoring: Json }
        Returns: number
      }
      create_campaign_with_defaults: {
        Args: {
          campaign_name: string
          default_prizes?: Json
          org_id: string
          wheel_style?: Json
        }
        Returns: string
      }
      create_contest_league: {
        Args: { p_contest_id: string; p_name: string; p_player_id: string }
        Returns: {
          code: string
          league_id: string
          name: string
        }[]
      }
      create_experience_blueprint: {
        Args: {
          p_actor_id: string
          p_assets?: Json
          p_configuration: Json
          p_default_rewards?: Json
          p_description: string
          p_kind: string
          p_name: string
          p_organization_id: string
          p_schema_version: number
        }
        Returns: {
          blueprint_id: string
          version: number
        }[]
      }
      create_experience_blueprint_version: {
        Args: {
          p_actor_id: string
          p_assets?: Json
          p_blueprint_id: string
          p_configuration: Json
          p_default_rewards?: Json
          p_expected_latest_version: number
          p_organization_id: string
          p_schema_version: number
        }
        Returns: number
      }
      create_organization: {
        Args: { org_name: string; org_slug: string }
        Returns: string
      }
      create_progression_badge: {
        Args: {
          p_description?: string
          p_icon_key?: string
          p_name: string
          p_organization_id: string
          p_season_id: string
        }
        Returns: string
      }
      create_progression_chest: {
        Args: {
          p_description: string
          p_item_ids: string[]
          p_key_cost: number
          p_name: string
          p_organization_id: string
          p_season_id: string
        }
        Returns: string
      }
      create_progression_collection: {
        Args: {
          p_description?: string
          p_name: string
          p_organization_id: string
          p_season_id: string
        }
        Returns: string
      }
      create_progression_collection_item: {
        Args: {
          p_collection_id: string
          p_description?: string
          p_image_url?: string
          p_name: string
          p_organization_id: string
        }
        Returns: string
      }
      create_progression_mission: {
        Args: {
          p_badge_id?: string
          p_collection_item_id?: string
          p_description: string
          p_distinct_experiences?: boolean
          p_event_name: string
          p_experience_kinds: string[]
          p_key_reward?: number
          p_name: string
          p_organization_id: string
          p_season_id: string
          p_source?: string
          p_target: number
        }
        Returns: string
      }
      create_progression_season: {
        Args: {
          p_ends_at: string
          p_name: string
          p_organization_id: string
          p_starts_at: string
        }
        Returns: string
      }
      create_reservation_invitation: {
        Args: {
          p_activity_id?: string
          p_actor: string
          p_expires_at?: string
          p_label: string
          p_max_uses?: number
          p_organization_id: string
          p_slot_id?: string
          p_token_hash: string
        }
        Returns: Json
      }
      credit_sms_balance: {
        Args: {
          p_destination_country?: string
          p_organization_id: string
          p_reason?: string
          p_reference?: string
          p_unit_cost_micros?: number
          p_units: number
        }
        Returns: {
          created: boolean
          entry_id: string
        }[]
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
      customer_segment_matches: {
        Args: { p_last_win: string; p_segment: string; p_wins: number }
        Returns: boolean
      }
      debit_sms_balance_for_refund: {
        Args: { p_organization_id: string; p_source_reference: string }
        Returns: {
          debited_units: number
          entry_id: string
          org_id: string
        }[]
      }
      debit_sms_credit: {
        Args: {
          p_destination_country?: string
          p_organization_id: string
          p_reference?: string
          p_units?: number
        }
        Returns: string
      }
      declare_sms_sender: {
        Args: {
          p_af2m_reference: string
          p_organization_id: string
          p_sender_id: string
        }
        Returns: boolean
      }
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
      delete_progression_badge: {
        Args: { p_badge_id: string; p_organization_id: string }
        Returns: boolean
      }
      delete_progression_chest: {
        Args: { p_chest_id: string; p_organization_id: string }
        Returns: boolean
      }
      delete_progression_collection: {
        Args: { p_collection_id: string; p_organization_id: string }
        Returns: boolean
      }
      delete_progression_collection_item: {
        Args: { p_item_id: string; p_organization_id: string }
        Returns: boolean
      }
      delete_progression_mission: {
        Args: { p_mission_id: string; p_organization_id: string }
        Returns: boolean
      }
      delete_progression_season: {
        Args: { p_organization_id: string; p_season_id: string }
        Returns: boolean
      }
      draw_quiz_winners: {
        Args: { p_organization_id: string; p_quiz_id: string }
        Returns: Json
      }
      end_event_session: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: Json
      }
      end_progression_season: {
        Args: { p_organization_id: string; p_season_id: string }
        Returns: boolean
      }
      ensure_referral_sponsor: {
        Args: { p_campaign_id: string; p_email?: string; p_sponsor_key: string }
        Returns: Json
      }
      event_etat_joueur: {
        Args: { p_player_token_hash: string; p_session_id: string }
        Returns: Json
      }
      event_etat_partage: { Args: { p_session_id: string }; Returns: Json }
      event_participant_capacity: {
        Args: { p_organization_id: string }
        Returns: number
      }
      event_public_state: {
        Args: { p_player_token_hash?: string; p_session_id: string }
        Returns: Json
      }
      evict_waitlist_entry: {
        Args: { p_actor: string; p_entry_id: string; p_organization_id: string }
        Returns: Json
      }
      experience_belongs_to_organization: {
        Args: {
          p_experience_id: string
          p_kind: string
          p_organization_id: string
        }
        Returns: boolean
      }
      expire_waitlist_offers: {
        Args: never
        Returns: {
          offers_created: number
          offers_expired: number
          slots_processed: number
        }[]
      }
      finalize_contest: {
        Args: {
          p_contest_id: string
          p_organization_id: string
          p_tiebreaker_answer?: number
        }
        Returns: Json
      }
      finish_quiz: {
        Args: { p_player_token_hash: string; p_quiz_id: string }
        Returns: Json
      }
      finish_sms_delivery: {
        Args: {
          p_dedup_key: string
          p_error?: string
          p_organization_id: string
          p_provider_message_id?: string
          p_status: string
        }
        Returns: boolean
      }
      format_player_alias: { Args: { p_alias: string }; Returns: string }
      grant_first_super_admin: { Args: { p_email: string }; Returns: string }
      grant_module_from_payment: {
        Args: {
          p_activate_by?: string
          p_capacity?: number
          p_ends_at?: string
          p_kind: string
          p_module: string
          p_organization_id: string
          p_resource_id?: string
          p_source_reference: string
          p_starts_at?: string
        }
        Returns: {
          grant_id: string
          outcome: string
        }[]
      }
      hold_stock_offer: {
        Args: {
          p_consent?: boolean
          p_email?: string
          p_offer_id: string
          p_organization_id: string
          p_player_key_hash: string
        }
        Returns: Json
      }
      hunt_players_in_progress: { Args: { p_hunt_id: string }; Returns: number }
      hunt_settlement_preview: {
        Args: { p_hunt_id: string; p_removed_step_id: string }
        Returns: number
      }
      import_vitrine_carte: {
        Args: { p_organization_id: string; p_payload: Json }
        Returns: Json
      }
      increment_module_page_open: {
        Args: { p_module: string; p_public_id: string }
        Returns: undefined
      }
      increment_qr_scan: { Args: { p_slug: string }; Returns: undefined }
      is_org_editor: { Args: { p_organization_id: string }; Returns: boolean }
      is_org_member: { Args: { org_id: string }; Returns: boolean }
      is_org_owner: { Args: { org_id: string }; Returns: boolean }
      is_reserved_vitrine_slug: { Args: { p_slug: string }; Returns: boolean }
      is_safe_experience_metadata: { Args: { p_value: Json }; Returns: boolean }
      is_valid_contest_answer: {
        Args: {
          p_answer: Json
          p_options: Json
          p_question_type: string
          p_ranking_size: number
        }
        Returns: boolean
      }
      is_valid_contest_options: { Args: { p_options: Json }; Returns: boolean }
      is_valid_contest_question: {
        Args: {
          p_correct_answer: Json
          p_options: Json
          p_prompt: string
          p_question_type: string
          p_ranking_size: number
        }
        Returns: boolean
      }
      is_valid_contest_rewards: { Args: { p_value: Json }; Returns: boolean }
      is_valid_contest_scoring: { Args: { p_value: Json }; Returns: boolean }
      is_valid_experience_blueprint_payload: {
        Args: {
          p_assets: Json
          p_configuration: Json
          p_default_rewards: Json
          p_kind: string
          p_schema_version: number
        }
        Returns: boolean
      }
      is_valid_experience_steps: { Args: { p_steps: Json }; Returns: boolean }
      is_valid_progression_rule: { Args: { p_rule: Json }; Returns: boolean }
      is_valid_quiz_answer: {
        Args: {
          p_answer: Json
          p_options: Json
          p_question_type: string
          p_ranking_size: number
        }
        Returns: boolean
      }
      is_valid_quiz_question: {
        Args: {
          p_correct_answer: Json
          p_options: Json
          p_prompt: string
          p_question_type: string
          p_ranking_size: number
          p_tolerance: number
        }
        Returns: boolean
      }
      is_valid_quiz_solution: {
        Args: {
          p_correct_answer: Json
          p_options: Json
          p_question_type: string
          p_ranking_size: number
        }
        Returns: boolean
      }
      is_valid_timezone: { Args: { p_timezone: string }; Returns: boolean }
      is_valid_vitrine_theme: { Args: { p_theme: Json }; Returns: boolean }
      is_valid_vitrine_vocabulaire: {
        Args: { p_valeurs: string[]; p_vocabulaire: string[] }
        Returns: boolean
      }
      join_calendar: {
        Args: {
          p_email?: string
          p_marketing_opt_in?: boolean
          p_player_token_hash: string
          p_reminder_opt_in?: boolean
          p_slug: string
        }
        Returns: Json
      }
      join_contest_league: {
        Args: { p_code: string; p_contest_id: string; p_player_id: string }
        Returns: {
          code: string
          league_id: string
          name: string
        }[]
      }
      join_event_session: {
        Args: {
          p_avatar: string
          p_join_code: string
          p_player_token_hash: string
          p_pseudo: string
        }
        Returns: Json
      }
      join_quiz: {
        Args: {
          p_avatar?: string
          p_email?: string
          p_first_name?: string
          p_marketing_opt_in?: boolean
          p_player_token_hash: string
          p_slug: string
        }
        Returns: Json
      }
      launch_event_question: {
        Args: {
          p_organization_id: string
          p_question_id: string
          p_session_id: string
        }
        Returns: Json
      }
      leave_contest_league: {
        Args: { p_contest_id: string; p_league_id: string; p_player_id: string }
        Returns: boolean
      }
      lock_event_question: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: Json
      }
      lookup_player_identity: {
        Args: {
          p_device_token_hash: string
          p_experience_id: string
          p_experience_kind: string
          p_organization_id: string
        }
        Returns: {
          experience_membership_id: string
          legacy_identity_hash: string
          player_id: string
        }[]
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
      moderate_event_player: {
        Args: {
          p_moderation_state: string
          p_organization_id: string
          p_player_id: string
          p_reason?: string
          p_session_id: string
        }
        Returns: Json
      }
      normalize_player_alias: { Args: { p_alias: string }; Returns: string }
      open_calendar_box: {
        Args: {
          p_calendar_id: string
          p_day_id: string
          p_player_token_hash: string
        }
        Returns: Json
      }
      open_progression_chest: {
        Args: {
          p_chest_id: string
          p_device_token_hash: string
          p_organization_id: string
          p_request_id: string
        }
        Returns: Json
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
      ops_workers_health: {
        Args: never
        Returns: {
          configured: boolean
          expected_period_seconds: number
          healthy: boolean
          last_completed_at: string
          last_lag_seconds: number
          last_started_at: string
          last_status: string
          last_success_at: string
          oldest_due_job_age_minutes: number
          reason: string
          worker: string
        }[]
      }
      org_animation_center_counts: {
        Args: { p_organization_id: string }
        Returns: {
          drafts: number
          live_experiences: number
          low_stock_prizes: number
          qr_never_scanned: number
          rewards_to_hand_over: number
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
        Args: {
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_q?: string
          p_segment?: string
          p_tri?: string
        }
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
      org_effective_entitlements: {
        Args: { p_organization_id: string }
        Returns: {
          entitlement: string
        }[]
      }
      org_experience_analytics: {
        Args: { p_days?: number; p_organization_id: string }
        Returns: Json
      }
      org_has_active_access: {
        Args: { p_now?: string; p_organization_id: string }
        Returns: boolean
      }
      org_has_live_module_grant: {
        Args: { p_module: string; p_now?: string; p_organization_id: string }
        Returns: boolean
      }
      org_has_live_resource_grant: {
        Args: {
          p_module: string
          p_now?: string
          p_organization_id: string
          p_resource_id: string
        }
        Returns: boolean
      }
      org_has_module_access: {
        Args: { p_module: string; p_now?: string; p_organization_id: string }
        Returns: boolean
      }
      org_has_module_access_for_resource: {
        Args: {
          p_module: string
          p_now?: string
          p_organization_id: string
          p_resource_id: string
        }
        Returns: boolean
      }
      org_has_subscription_access: {
        Args: { p_now?: string; p_organization_id: string }
        Returns: boolean
      }
      org_module_grant_state: {
        Args: { p_module: string; p_now?: string; p_organization_id: string }
        Returns: {
          activate_by: string
          capacity: number
          ends_at: string
          grant_id: string
          starts_at: string
          state: string
        }[]
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
      org_progression_snapshot: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      org_qr_hub: {
        Args: {
          p_etat?: string
          p_jamais_scanne?: boolean
          p_kind?: string
          p_limit?: number
          p_offset?: number
          p_organization_id: string
          p_q?: string
        }
        Returns: {
          created_at: string
          etat: string
          extra_count: number
          item_id: string
          kind: string
          name: string
          open_count: number
          qr_id: string
          qr_label: string
          qr_slug: string
          qr_style: Json
          scan_count: number
          status: string
          total_count: number
          url_path: string
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
      org_weekly_digest: {
        Args: { p_days?: number; p_organization_id: string }
        Returns: {
          basket_cents: number
          period_days: number
          players: number
          prev_basket_cents: number
          prev_players: number
          prev_rewards_issued: number
          prev_rewards_redeemed: number
          rewards_issued: number
          rewards_redeemed: number
          top_rewards: Json
        }[]
      }
      perform_atomic_spin: {
        Args: {
          p_campaign_id: string
          p_engagement_action: string
          p_force_losing?: boolean
          p_idempotency_key?: string
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
      player_alias_is_allowed: { Args: { p_alias: string }; Returns: boolean }
      player_experience_scope_is_valid: {
        Args: {
          p_experience_id: string
          p_experience_kind: string
          p_organization_id: string
        }
        Returns: boolean
      }
      player_progression_archive: {
        Args: { p_device_token_hash: string; p_organization_id: string }
        Returns: Json
      }
      player_progression_snapshot: {
        Args: { p_device_token_hash: string; p_organization_id: string }
        Returns: Json
      }
      player_wallet: {
        Args: { p_limit?: number; p_token_hash: string }
        Returns: {
          cancelled_cause: string
          code: string
          expires_at: string
          issued_at: string
          label: string
          organization_id: string
          organization_name: string
          source_type: string
          status: string
        }[]
      }
      prune_rate_limits: {
        Args: { p_older_than_seconds?: number }
        Returns: undefined
      }
      publish_experience_blueprint_version: {
        Args: {
          p_actor_id: string
          p_blueprint_id: string
          p_organization_id: string
          p_version: number
        }
        Returns: boolean
      }
      purge_expired_calendar_players: { Args: never; Returns: number }
      purge_expired_contest_players: { Args: never; Returns: number }
      purge_expired_event_sessions: { Args: never; Returns: number }
      purge_expired_experience_events: { Args: never; Returns: number }
      purge_expired_hunt_players: { Args: never; Returns: number }
      purge_expired_jackpot_players: { Args: never; Returns: number }
      purge_expired_loyalty_members: { Args: never; Returns: number }
      purge_expired_meta_progression: { Args: never; Returns: number }
      purge_expired_personal_data: {
        Args: never
        Returns: {
          organizations_processed: number
          participations_deleted: number
          subscribers_deleted: number
        }[]
      }
      purge_expired_quiz_players: { Args: never; Returns: number }
      purge_expired_referral_data: { Args: never; Returns: number }
      purge_expired_reward_issuances: { Args: never; Returns: number }
      purge_ops_worker_runs: {
        Args: { p_older_than_days?: number; p_stale_after_minutes?: number }
        Returns: {
          deleted: number
          reaped: number
        }[]
      }
      queue_call_next: {
        Args: { p_actor: string; p_organization_id: string; p_queue_id: string }
        Returns: Json
      }
      queue_entry_position: {
        Args: {
          p_entry: Database["public"]["Tables"]["reservation_queue_entries"]["Row"]
        }
        Returns: number
      }
      queue_join: {
        Args: {
          p_consent?: boolean
          p_display_name?: string
          p_email?: string
          p_organization_id: string
          p_player_key_hash: string
          p_queue_id: string
        }
        Returns: Json
      }
      queue_leave: {
        Args: { p_entry_id: string; p_player_key_hash: string }
        Returns: Json
      }
      queue_public_state: {
        Args: { p_player_key_hash: string; p_queue_id: string }
        Returns: Json
      }
      queue_reopen_entry: {
        Args: { p_actor: string; p_entry_id: string; p_organization_id: string }
        Returns: Json
      }
      queue_resolve: {
        Args: {
          p_actor: string
          p_entry_id: string
          p_organization_id: string
          p_outcome: string
        }
        Returns: Json
      }
      queue_staff_state: {
        Args: { p_organization_id: string; p_queue_id: string }
        Returns: Json
      }
      quiz_answer_is_correct: {
        Args: {
          p_answer: Json
          p_correct_answer: Json
          p_question_type: string
          p_tolerance?: number
        }
        Returns: boolean
      }
      quiz_emit_reward: {
        Args: {
          p_organization_id: string
          p_player_id: string
          p_quiz_id: string
          p_rank?: number
          p_source: string
        }
        Returns: Json
      }
      quiz_leaderboard: {
        Args: { p_limit?: number; p_offset?: number; p_quiz_id: string }
        Returns: {
          avatar: string
          correct_count: number
          finished_at: string
          first_name: string
          player_id: string
          rank: number
          score: number
          total_elapsed_ms: number
          total_players: number
        }[]
      }
      quiz_normalize_text: { Args: { p_value: string }; Returns: string }
      quiz_public_state: {
        Args: { p_player_token_hash?: string; p_quiz_id: string }
        Returns: Json
      }
      record_experience_event: {
        Args: {
          p_basket_cents?: number
          p_campaign_id?: string
          p_event_name: string
          p_experience_id: string
          p_experience_kind: string
          p_idempotency_key?: string
          p_metadata?: Json
          p_organization_id: string
          p_player_id?: string
          p_player_key?: string
          p_qr_code_id?: string
          p_reward_cost_cents?: number
          p_reward_issuance_id?: string
          p_source?: string
        }
        Returns: number
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
          p_order_token?: string
          p_program_id: string
          p_rotating_code?: string
          p_validated_by?: string
        }
        Returns: Json
      }
      record_sms_consent: {
        Args: {
          p_consent_source?: string
          p_consent_version: string
          p_organization_id: string
          p_phone: string
          p_renew?: boolean
        }
        Returns: string
      }
      recover_pending_spin: {
        Args: { p_player_key: string; p_wheel_id: string }
        Returns: {
          created_at: string
          prize_id: string
          spin_id: string
        }[]
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
      redeem_calendar_reward: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          calendar_name: string
          code: string
          created_at: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
          source: string
        }[]
      }
      redeem_contest_award: {
        Args: {
          p_actor: string
          p_basket_cents?: number
          p_code: string
          p_organization_id: string
        }
        Returns: {
          basket_cents: number
          code: string
          contest_name: string
          created_at: string
          id: string
          player_name: string
          rank: number
          redeem_expires_at: string
          redeemed_at: string
          redeemed_now: boolean
          reward_label: string
          status: string
        }[]
      }
      redeem_event_prize: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          code: string
          created_at: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
          session_label: string
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
      redeem_invitation: {
        Args: {
          p_consent?: boolean
          p_email?: string
          p_organization_id: string
          p_player_key_hash: string
          p_slot_id?: string
          p_token_hash: string
        }
        Returns: Json
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
      redeem_quiz_reward: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          code: string
          created_at: string
          id: string
          quiz_name: string
          rank: number
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
          source: string
        }[]
      }
      redeem_referral_reward: {
        Args: { p_actor: string; p_code: string; p_organization_id: string }
        Returns: {
          beneficiary: string
          campaign_name: string
          code: string
          created_at: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          reward_details: string
          reward_label: string
        }[]
      }
      redeem_reward_by_code: {
        Args: {
          p_actor: string
          p_basket_cents?: number
          p_code: string
          p_organization_id: string
        }
        Returns: {
          basket_cents: number
          cancelled_at: string
          code: string
          expires_at: string
          id: string
          redeemed_at: string
          redeemed_by: string
          redeemed_now: boolean
          source_id: string
          source_type: string
          state: string
          wallet_status: string
        }[]
      }
      redeem_stock_hold: {
        Args: {
          p_actor: string
          p_basket_cents?: number
          p_code: string
          p_organization_id: string
        }
        Returns: {
          code: string
          id: string
          redeemed_at: string
          redeemed_now: boolean
          status: string
        }[]
      }
      referral_emit_reward: {
        Args: {
          p_beneficiary: string
          p_campaign_id: string
          p_kind: string
          p_organization_id: string
          p_program_id: string
          p_signup_id: string
          p_sponsor_id: string
        }
        Returns: Json
      }
      referral_public_state: {
        Args: { p_campaign_id: string; p_sponsor_key: string }
        Returns: Json
      }
      refund_sms_credit: {
        Args: { p_entry_id: string; p_reference?: string }
        Returns: string
      }
      request_sms_sender: {
        Args: { p_organization_id: string; p_sender_id: string }
        Returns: string
      }
      requeue_stale_jobs: { Args: never; Returns: number }
      reservation_activity_live_commitments: {
        Args: { p_activity_id: string; p_organization_id: string }
        Returns: Json
      }
      reservation_activity_live_counts: {
        Args: { p_activity_id: string; p_organization_id: string }
        Returns: Json
      }
      reservation_offer_next: {
        Args: { p_organization_id: string; p_slot_id: string }
        Returns: number
      }
      reservation_public_state: {
        Args: { p_organization_id: string; p_player_key_hash: string }
        Returns: Json
      }
      reserve_slot: {
        Args: {
          p_consent?: boolean
          p_email?: string
          p_organization_id: string
          p_party_size?: number
          p_player_key_hash: string
          p_slot_id: string
        }
        Returns: Json
      }
      resolve_player_identity: {
        Args: {
          p_acquisition_qr_code_id: string
          p_acquisition_source: string
          p_device_token_hash: string
          p_experience_id: string
          p_experience_kind: string
          p_legacy_identity_hash: string
          p_organization_id: string
        }
        Returns: {
          device_created: boolean
          device_id: string
          experience_membership_id: string
          legacy_identity_hash: string
          player_id: string
          should_rotate: boolean
        }[]
      }
      restore_experience_blueprint_version: {
        Args: {
          p_actor_id: string
          p_blueprint_id: string
          p_expected_latest_version: number
          p_organization_id: string
          p_source_version: number
        }
        Returns: number
      }
      restore_prize_stock: { Args: { p_prize_id: string }; Returns: undefined }
      resync_calendar_progress: {
        Args: { p_calendar_id: string }
        Returns: number
      }
      reveal_event_question: {
        Args: {
          p_correct_option_id?: string
          p_organization_id: string
          p_session_id: string
        }
        Returns: Json
      }
      revoke_grant_for_refund: {
        Args: {
          p_organization_id: string
          p_reason: string
          p_source_reference: string
        }
        Returns: {
          grant_id: string
          grant_module: string
          revoked: boolean
        }[]
      }
      revoke_reservation_invitation: {
        Args: {
          p_actor: string
          p_invitation_id: string
          p_organization_id: string
        }
        Returns: Json
      }
      revoke_sms_consent: {
        Args: { p_organization_id: string; p_phone: string; p_reason?: string }
        Returns: boolean
      }
      reward_player_from_legacy: {
        Args: {
          p_experience_id: string
          p_experience_kind: string
          p_legacy_identity_hash: string
          p_organization_id: string
        }
        Returns: string
      }
      rotate_player_device: {
        Args: { p_new_token_hash: string; p_old_token_hash: string }
        Returns: {
          device_id: string
          player_id: string
        }[]
      }
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
      set_calendar_status: {
        Args: {
          p_calendar_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_campaign_status: {
        Args: {
          p_campaign_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
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
      set_contest_question_result: {
        Args: {
          p_correct_answer: Json
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
      set_event_game_status: {
        Args: {
          p_game_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_hunt_status: {
        Args: {
          p_hunt_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_jackpot_campaign_status: {
        Args: {
          p_campaign_id: string
          p_organization_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_loyalty_program_status: {
        Args: {
          p_organization_id: string
          p_program_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_progression_chest_enabled: {
        Args: {
          p_chest_id: string
          p_enabled: boolean
          p_organization_id: string
        }
        Returns: boolean
      }
      set_progression_mission_enabled: {
        Args: {
          p_enabled: boolean
          p_mission_id: string
          p_organization_id: string
        }
        Returns: boolean
      }
      set_quiz_status: {
        Args: {
          p_organization_id: string
          p_quiz_id: string
          p_reason?: string
          p_status: string
        }
        Returns: boolean
      }
      set_referral_program_enabled: {
        Args: {
          p_enabled: boolean
          p_organization_id: string
          p_program_id: string
          p_reason?: string
        }
        Returns: boolean
      }
      set_sms_sender_status: {
        Args: {
          p_organization_id: string
          p_reason?: string
          p_sender_id: string
          p_status: string
        }
        Returns: boolean
      }
      set_sms_unit_cost: {
        Args: {
          p_currency?: string
          p_organization_id: string
          p_unit_cost_micros: number
        }
        Returns: boolean
      }
      set_team_member_role: {
        Args: { p_organization_id: string; p_role: string; p_user_id: string }
        Returns: string
      }
      set_vitrine_slug: {
        Args: { p_actor: string; p_organization_id: string; p_slug: string }
        Returns: Json
      }
      set_worker_vault_secrets: {
        Args: { p_secret: string; p_url: string; p_worker: string }
        Returns: {
          also_affects_workers: string[]
          error_code: string
          shared_created: boolean
          shared_secret_name: string
          status: string
          url_created: boolean
          url_secret_name: string
          written: boolean
        }[]
      }
      settle_hunt_completions: { Args: { p_hunt_id: string }; Returns: number }
      show_event_leaderboard: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: Json
      }
      sms_phone_e164: {
        Args: { p_default_country?: string; p_phone: string }
        Returns: string
      }
      sms_sender_for_send: {
        Args: { p_organization_id: string }
        Returns: string
      }
      start_event_session: {
        Args: { p_organization_id: string; p_session_id: string }
        Returns: Json
      }
      start_quiz_question: {
        Args: {
          p_player_token_hash: string
          p_question_id: string
          p_quiz_id: string
        }
        Returns: Json
      }
      stock_offer_public_state: {
        Args: { p_offer_id: string; p_player_key_hash?: string }
        Returns: Json
      }
      stock_offers_staff_state: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      submit_contest_answer: {
        Args: {
          p_answer: Json
          p_contest_id: string
          p_match_id: string
          p_player_id: string
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
      submit_event_answer: {
        Args: {
          p_option_id: string
          p_player_token_hash: string
          p_question_id: string
          p_session_id: string
        }
        Returns: Json
      }
      submit_quiz_answer: {
        Args: {
          p_answer: Json
          p_player_token_hash: string
          p_question_id: string
          p_quiz_id: string
        }
        Returns: Json
      }
      sync_reward_issuance: {
        Args: { p_legacy_table: string; p_source_id: string }
        Returns: undefined
      }
      update_admin_safely: {
        Args: { p_admin_id: string; p_is_active?: boolean; p_role?: string }
        Returns: boolean
      }
      update_contest_event_settings: {
        Args: {
          p_contest_id: string
          p_default_locks_at: string
          p_event_kind: string
          p_organization_id: string
          p_reason?: string
        }
        Returns: boolean
      }
      update_contest_generic_scoring: {
        Args: {
          p_contest_id: string
          p_organization_id: string
          p_reason?: string
          p_values: Json
        }
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
      update_progression_badge: {
        Args: {
          p_badge_id: string
          p_description?: string
          p_icon_key?: string
          p_name: string
          p_organization_id: string
        }
        Returns: boolean
      }
      update_progression_chest: {
        Args: {
          p_chest_id: string
          p_description: string
          p_enabled?: boolean
          p_item_ids: string[]
          p_key_cost: number
          p_name: string
          p_organization_id: string
        }
        Returns: boolean
      }
      update_progression_collection: {
        Args: {
          p_collection_id: string
          p_description?: string
          p_name: string
          p_organization_id: string
        }
        Returns: boolean
      }
      update_progression_collection_item: {
        Args: {
          p_description?: string
          p_image_url?: string
          p_item_id: string
          p_name: string
          p_organization_id: string
          p_position?: number
        }
        Returns: boolean
      }
      update_progression_mission: {
        Args: {
          p_badge_id?: string
          p_collection_item_id?: string
          p_description: string
          p_distinct_experiences?: boolean
          p_enabled?: boolean
          p_event_name: string
          p_experience_kinds: string[]
          p_key_reward?: number
          p_mission_id: string
          p_name: string
          p_organization_id: string
          p_source?: string
          p_target: number
        }
        Returns: number
      }
      upsert_player_alias: {
        Args: { p_alias: string; p_experience_membership_id: string }
        Returns: {
          alias_id: string
          display_alias: string
          moderation_state: string
        }[]
      }
      upsert_reward_issuance: {
        Args: {
          p_basket_cents: number
          p_cancelled_at: string
          p_cancelled_reason: string
          p_code: string
          p_experience_id: string
          p_expires_at: string
          p_issued_at: string
          p_label: string
          p_metadata: Json
          p_organization_id: string
          p_player_id: string
          p_redeemed_at: string
          p_redeemed_by: string
          p_reward_definition_id: string
          p_source_id: string
          p_source_type: string
        }
        Returns: undefined
      }
      upsert_vitrine_translation: {
        Args: {
          p_champ: string
          p_cible_id: string
          p_cible_type: string
          p_lang: string
          p_organization_id: string
          p_texte: string
          p_version_source: string
        }
        Returns: Json
      }
      validate_referral: {
        Args: {
          p_campaign_id: string
          p_filleul_email?: string
          p_filleul_key: string
          p_ip?: string
          p_proof_spin_id: string
          p_referral_code: string
        }
        Returns: Json
      }
      vitrine_cartes_json: {
        Args: {
          p_actives_seulement: boolean
          p_lang?: string
          p_organization_id: string
        }
        Returns: Json
      }
      vitrine_champs_traduisibles: {
        Args: { p_actives_seulement: boolean; p_organization_id: string }
        Returns: {
          champ: string
          cible_id: string
          cible_type: string
          version_courante: string
        }[]
      }
      vitrine_dashboard_state: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      vitrine_public_state: {
        Args: { p_lang?: string; p_slug: string }
        Returns: Json
      }
      vitrine_translation_state: {
        Args: { p_organization_id: string }
        Returns: Json
      }
      wait_session_open: {
        Args: {
          p_organization_id: string
          p_player_key_hash: string
          p_queue_entry_id?: string
          p_reservation_id?: string
        }
        Returns: Json
      }
      wait_session_use_pause: {
        Args: {
          p_organization_id: string
          p_player_key_hash: string
          p_session_id: string
        }
        Returns: Json
      }
      waitlist_join: {
        Args: {
          p_consent?: boolean
          p_email?: string
          p_organization_id: string
          p_player_key_hash: string
          p_slot_id: string
        }
        Returns: Json
      }
      waitlist_leave: {
        Args: { p_entry_id: string; p_player_key_hash: string }
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
