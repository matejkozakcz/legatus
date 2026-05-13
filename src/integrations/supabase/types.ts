export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activity_records: {
        Row: {
          bj: number
          bj_fsa_actual: number | null
          bj_ser_actual: number | null
          created_at: string | null
          dop_kl_actual: number | null
          fsa_actual: number | null
          fsa_planned: number | null
          id: string
          info_actual: number
          info_planned: number
          kl_fsa_actual: number | null
          poh_actual: number | null
          poh_planned: number | null
          por_actual: number | null
          por_planned: number | null
          postinfo_actual: number
          postinfo_planned: number
          ref_actual: number | null
          ref_planned: number | null
          ser_actual: number | null
          ser_planned: number | null
          updated_at: string | null
          user_id: string
          week_start: string
        }
        Insert: {
          bj?: number
          bj_fsa_actual?: number | null
          bj_ser_actual?: number | null
          created_at?: string | null
          dop_kl_actual?: number | null
          fsa_actual?: number | null
          fsa_planned?: number | null
          id?: string
          info_actual?: number
          info_planned?: number
          kl_fsa_actual?: number | null
          poh_actual?: number | null
          poh_planned?: number | null
          por_actual?: number | null
          por_planned?: number | null
          postinfo_actual?: number
          postinfo_planned?: number
          ref_actual?: number | null
          ref_planned?: number | null
          ser_actual?: number | null
          ser_planned?: number | null
          updated_at?: string | null
          user_id: string
          week_start: string
        }
        Update: {
          bj?: number
          bj_fsa_actual?: number | null
          bj_ser_actual?: number | null
          created_at?: string | null
          dop_kl_actual?: number | null
          fsa_actual?: number | null
          fsa_planned?: number | null
          id?: string
          info_actual?: number
          info_planned?: number
          kl_fsa_actual?: number | null
          poh_actual?: number | null
          poh_planned?: number | null
          por_actual?: number | null
          por_planned?: number | null
          postinfo_actual?: number
          postinfo_planned?: number
          ref_actual?: number | null
          ref_planned?: number | null
          ser_actual?: number | null
          ser_planned?: number | null
          updated_at?: string | null
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      app_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string | null
          value: Json
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string | null
          value?: Json
        }
        Relationships: []
      }
      bj_audit_log: {
        Row: {
          action: string
          change_reason: string | null
          changed_by: string
          created_at: string
          id: string
          new_bj: number | null
          old_bj: number | null
          source: string
          source_id: string
          user_id: string
        }
        Insert: {
          action: string
          change_reason?: string | null
          changed_by: string
          created_at?: string
          id?: string
          new_bj?: number | null
          old_bj?: number | null
          source: string
          source_id: string
          user_id: string
        }
        Update: {
          action?: string
          change_reason?: string | null
          changed_by?: string
          created_at?: string
          id?: string
          new_bj?: number | null
          old_bj?: number | null
          source?: string
          source_id?: string
          user_id?: string
        }
        Relationships: []
      }
      call_party_entries: {
        Row: {
          client_name: string
          created_at: string
          created_candidate_id: string | null
          created_case_id: string | null
          created_meeting_id: string | null
          id: string
          meeting_type: string | null
          outcome: string
          session_id: string
          sort_order: number
        }
        Insert: {
          client_name?: string
          created_at?: string
          created_candidate_id?: string | null
          created_case_id?: string | null
          created_meeting_id?: string | null
          id?: string
          meeting_type?: string | null
          outcome?: string
          session_id: string
          sort_order?: number
        }
        Update: {
          client_name?: string
          created_at?: string
          created_candidate_id?: string | null
          created_case_id?: string | null
          created_meeting_id?: string | null
          id?: string
          meeting_type?: string | null
          outcome?: string
          session_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "call_party_entries_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "call_party_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      call_party_sessions: {
        Row: {
          created_at: string
          date: string
          goals: Json | null
          id: string
          name: string
          notes: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          goals?: Json | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          goals?: Json | null
          id?: string
          name?: string
          notes?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cases: {
        Row: {
          created_at: string
          id: string
          nazev_pripadu: string
          poznamka: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nazev_pripadu: string
          poznamka?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nazev_pripadu?: string
          poznamka?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meetings: {
        Row: {
          bj: number
          cancelled: boolean
          case_id: string | null
          case_name: string | null
          created_at: string
          date: string
          doporuceni_fsa: number
          doporuceni_pohovor: number
          doporuceni_poradenstvi: number
          duration_minutes: number | null
          external_event_id: string | null
          has_pohovor: boolean
          has_poradenstvi: boolean
          id: string
          info_pocet_lidi: number | null
          info_zucastnil_se: boolean | null
          location_detail: string | null
          location_type: string | null
          meeting_time: string | null
          meeting_type: string
          outcome_recorded: boolean
          parent_meeting_id: string | null
          podepsane_bj: number
          pohovor_date: string | null
          pohovor_jde_dal: boolean | null
          poradenstvi_date: string | null
          poradenstvi_status: string | null
          potencial_bj: number | null
          poznamka: string | null
          recruitment_candidate_id: string | null
          updated_at: string
          user_id: string
          vizi_spoluprace: boolean
          week_start: string
        }
        Insert: {
          bj?: number
          cancelled?: boolean
          case_id?: string | null
          case_name?: string | null
          created_at?: string
          date: string
          doporuceni_fsa?: number
          doporuceni_pohovor?: number
          doporuceni_poradenstvi?: number
          duration_minutes?: number | null
          external_event_id?: string | null
          has_pohovor?: boolean
          has_poradenstvi?: boolean
          id?: string
          info_pocet_lidi?: number | null
          info_zucastnil_se?: boolean | null
          location_detail?: string | null
          location_type?: string | null
          meeting_time?: string | null
          meeting_type: string
          outcome_recorded?: boolean
          parent_meeting_id?: string | null
          podepsane_bj?: number
          pohovor_date?: string | null
          pohovor_jde_dal?: boolean | null
          poradenstvi_date?: string | null
          poradenstvi_status?: string | null
          potencial_bj?: number | null
          poznamka?: string | null
          recruitment_candidate_id?: string | null
          updated_at?: string
          user_id: string
          vizi_spoluprace?: boolean
          week_start?: string
        }
        Update: {
          bj?: number
          cancelled?: boolean
          case_id?: string | null
          case_name?: string | null
          created_at?: string
          date?: string
          doporuceni_fsa?: number
          doporuceni_pohovor?: number
          doporuceni_poradenstvi?: number
          duration_minutes?: number | null
          external_event_id?: string | null
          has_pohovor?: boolean
          has_poradenstvi?: boolean
          id?: string
          info_pocet_lidi?: number | null
          info_zucastnil_se?: boolean | null
          location_detail?: string | null
          location_type?: string | null
          meeting_time?: string | null
          meeting_type?: string
          outcome_recorded?: boolean
          parent_meeting_id?: string | null
          podepsane_bj?: number
          pohovor_date?: string | null
          pohovor_jde_dal?: boolean | null
          poradenstvi_date?: string | null
          poradenstvi_status?: string | null
          potencial_bj?: number | null
          poznamka?: string | null
          recruitment_candidate_id?: string | null
          updated_at?: string
          user_id?: string
          vizi_spoluprace?: boolean
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meetings_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meetings_parent_meeting_id_fkey"
            columns: ["parent_meeting_id"]
            isOneToOne: false
            referencedRelation: "client_meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_meetings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          action: string
          created_at: string
          error: string
          id: string
          metadata: Json | null
          resolved: boolean
          url: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          error: string
          id?: string
          metadata?: Json | null
          resolved?: boolean
          url?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          error?: string
          id?: string
          metadata?: Json | null
          resolved?: boolean
          url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      individual_meetings: {
        Row: {
          author_id: string
          created_at: string
          id: string
          meeting_date: string
          next_steps: string
          notes: string
          org_unit_id: string
          subject_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          created_at?: string
          id?: string
          meeting_date?: string
          next_steps?: string
          notes?: string
          org_unit_id: string
          subject_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          created_at?: string
          id?: string
          meeting_date?: string
          next_steps?: string
          notes?: string
          org_unit_id?: string
          subject_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "individual_meetings_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_meetings_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "individual_meetings_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      info_attendees: {
        Row: {
          attended: boolean | null
          candidate_id: string
          created_at: string
          id: string
          meeting_id: string
          updated_at: string
        }
        Insert: {
          attended?: boolean | null
          candidate_id: string
          created_at?: string
          id?: string
          meeting_id: string
          updated_at?: string
        }
        Update: {
          attended?: boolean | null
          candidate_id?: string
          created_at?: string
          id?: string
          meeting_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      invite_attempts: {
        Row: {
          created_at: string
          id: string
          inviter_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inviter_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inviter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_attempts_inviter_id_fkey"
            columns: ["inviter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          full_name: string | null
          id: string
          invited_by: string | null
          org_unit_id: string | null
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          org_unit_id?: string | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          org_unit_id?: string | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invites_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_bj_adjustments: {
        Row: {
          bj: number
          created_at: string
          created_by: string
          date: string
          id: string
          poznamka: string | null
          updated_at: string
          user_id: string
          week_start: string
        }
        Insert: {
          bj?: number
          created_at?: string
          created_by: string
          date: string
          id?: string
          poznamka?: string | null
          updated_at?: string
          user_id: string
          week_start: string
        }
        Update: {
          bj?: number
          created_at?: string
          created_by?: string
          date?: string
          id?: string
          poznamka?: string | null
          updated_at?: string
          user_id?: string
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_bj_adjustments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          accent_color: string | null
          body_template: string
          conditions: Json
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          last_run_at: string | null
          link_url: string | null
          name: string
          recipient_filters: Json
          recipient_roles: Json
          schedule_cron: string | null
          schedule_timezone: string
          title_template: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          accent_color?: string | null
          body_template: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          link_url?: string | null
          name: string
          recipient_filters?: Json
          recipient_roles?: Json
          schedule_cron?: string | null
          schedule_timezone?: string
          title_template: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          accent_color?: string | null
          body_template?: string
          conditions?: Json
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          last_run_at?: string | null
          link_url?: string | null
          name?: string
          recipient_filters?: Json
          recipient_roles?: Json
          schedule_cron?: string | null
          schedule_timezone?: string
          title_template?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_run_log: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          forced: boolean
          id: string
          inserted_count: number
          matched: boolean
          rule_id: string | null
          rule_name: string | null
          run_at: string
          trigger_event: string | null
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          forced?: boolean
          id?: string
          inserted_count?: number
          matched?: boolean
          rule_id?: string | null
          rule_name?: string | null
          run_at?: string
          trigger_event?: string | null
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          forced?: boolean
          id?: string
          inserted_count?: number
          matched?: boolean
          rule_id?: string | null
          rule_name?: string | null
          run_at?: string
          trigger_event?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notification_run_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "notification_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          accent_color: string | null
          body: string
          created_at: string
          icon: string | null
          id: string
          link_url: string | null
          payload: Json
          read_at: string | null
          recipient_id: string
          rule_id: string | null
          sender_id: string | null
          title: string
          trigger_event: string
        }
        Insert: {
          accent_color?: string | null
          body: string
          created_at?: string
          icon?: string | null
          id?: string
          link_url?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id: string
          rule_id?: string | null
          sender_id?: string | null
          title: string
          trigger_event: string
        }
        Update: {
          accent_color?: string | null
          body?: string
          created_at?: string
          icon?: string | null
          id?: string
          link_url?: string | null
          payload?: Json
          read_at?: string | null
          recipient_id?: string
          rule_id?: string | null
          sender_id?: string | null
          title?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "notification_rules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          completed: boolean
          completed_at: string | null
          created_at: string
          created_by: string
          deadline: string | null
          deadline_time: string | null
          description: string | null
          id: string
          novacek_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by: string
          deadline?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          novacek_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          completed?: boolean
          completed_at?: string | null
          created_at?: string
          created_by?: string
          deadline?: string | null
          deadline_time?: string | null
          description?: string | null
          id?: string
          novacek_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string
          id: string
          items: Json
          name: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          items?: Json
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          items?: Json
          name?: string
        }
        Relationships: []
      }
      org_units: {
        Row: {
          created_at: string
          id: string
          invite_token: string
          is_active: boolean
          name: string
          owner_id: string | null
          parent_unit_id: string | null
          show_bj_funnel: boolean
          show_recruitment_funnel: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          name: string
          owner_id?: string | null
          parent_unit_id?: string | null
          show_bj_funnel?: boolean
          show_recruitment_funnel?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          invite_token?: string
          is_active?: boolean
          name?: string
          owner_id?: string | null
          parent_unit_id?: string | null
          show_bj_funnel?: boolean
          show_recruitment_funnel?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "org_units_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_units_parent_unit_id_fkey"
            columns: ["parent_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          garant_id: string | null
          id: string
          is_active: boolean | null
          is_admin: boolean
          last_known_version: string | null
          last_seen_at: string | null
          monthly_bj_goal: number | null
          onboarding_completed: boolean | null
          org_unit_id: string | null
          osobni_id: string | null
          personal_bj_goal: number | null
          role: string
          vedouci_id: string | null
          ziskatel_id: string | null
          ziskatel_name: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          full_name: string
          garant_id?: string | null
          id: string
          is_active?: boolean | null
          is_admin?: boolean
          last_known_version?: string | null
          last_seen_at?: string | null
          monthly_bj_goal?: number | null
          onboarding_completed?: boolean | null
          org_unit_id?: string | null
          osobni_id?: string | null
          personal_bj_goal?: number | null
          role?: string
          vedouci_id?: string | null
          ziskatel_id?: string | null
          ziskatel_name?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          full_name?: string
          garant_id?: string | null
          id?: string
          is_active?: boolean | null
          is_admin?: boolean
          last_known_version?: string | null
          last_seen_at?: string | null
          monthly_bj_goal?: number | null
          onboarding_completed?: boolean | null
          org_unit_id?: string | null
          osobni_id?: string | null
          personal_bj_goal?: number | null
          role?: string
          vedouci_id?: string | null
          ziskatel_id?: string | null
          ziskatel_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_garant_id_fkey"
            columns: ["garant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_vedouci_id_fkey"
            columns: ["vedouci_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_ziskatel_id_fkey"
            columns: ["ziskatel_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_history: {
        Row: {
          created_at: string
          cumulative_bj: number | null
          direct_ziskatels: number | null
          event: string
          id: string
          note: string | null
          requested_role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          cumulative_bj?: number | null
          direct_ziskatels?: number | null
          event: string
          id?: string
          note?: string | null
          requested_role: string
          user_id: string
        }
        Update: {
          created_at?: string
          cumulative_bj?: number | null
          direct_ziskatels?: number | null
          event?: string
          id?: string
          note?: string | null
          requested_role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_requests: {
        Row: {
          cumulative_bj: number | null
          direct_ziskatels: number | null
          id: string
          requested_at: string
          requested_role: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          cumulative_bj?: number | null
          direct_ziskatels?: number | null
          id?: string
          requested_at?: string
          requested_role: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id: string
        }
        Update: {
          cumulative_bj?: number | null
          direct_ziskatels?: number | null
          id?: string
          requested_at?: string
          requested_role?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotion_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      promotion_rules: {
        Row: {
          created_at: string
          id: string
          min_bj: number | null
          min_direct: number | null
          min_structure: number | null
          org_unit_id: string | null
          transition: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          min_bj?: number | null
          min_direct?: number | null
          min_structure?: number | null
          org_unit_id?: string | null
          transition: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          min_bj?: number | null
          min_direct?: number | null
          min_structure?: number | null
          org_unit_id?: string | null
          transition?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_rules_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      push_delivery_log: {
        Row: {
          created_at: string
          errors: Json
          expired_removed: number
          failed: number
          general_error: string | null
          id: string
          notification_id: string | null
          recipient_id: string
          sent: number
          subscription_count: number
        }
        Insert: {
          created_at?: string
          errors?: Json
          expired_removed?: number
          failed?: number
          general_error?: string | null
          id?: string
          notification_id?: string | null
          recipient_id: string
          sent?: number
          subscription_count?: number
        }
        Update: {
          created_at?: string
          errors?: Json
          expired_removed?: number
          failed?: number
          general_error?: string | null
          id?: string
          notification_id?: string | null
          recipient_id?: string
          sent?: number
          subscription_count?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      recruitment_candidates: {
        Row: {
          created_at: string
          current_stage: string
          email: string | null
          full_name: string
          id: string
          lost_reason: string | null
          notes: string | null
          org_unit_id: string
          owner_id: string
          phone: string | null
          registered_profile_id: string | null
          source: string | null
          stage_changed_at: string
          stage_history: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_stage?: string
          email?: string | null
          full_name: string
          id?: string
          lost_reason?: string | null
          notes?: string | null
          org_unit_id: string
          owner_id: string
          phone?: string | null
          registered_profile_id?: string | null
          source?: string | null
          stage_changed_at?: string
          stage_history?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_stage?: string
          email?: string | null
          full_name?: string
          id?: string
          lost_reason?: string | null
          notes?: string | null
          org_unit_id?: string
          owner_id?: string
          phone?: string | null
          registered_profile_id?: string | null
          source?: string | null
          stage_changed_at?: string
          stage_history?: Json
          updated_at?: string
        }
        Relationships: []
      }
      user_calendar_connections: {
        Row: {
          access_token: string
          account_email: string | null
          calendar_id: string
          created_at: string
          id: string
          last_sync_at: string | null
          provider: string
          refresh_token: string
          scope: string | null
          token_expires_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_email?: string | null
          calendar_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          refresh_token: string
          scope?: string | null
          token_expires_at: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_email?: string | null
          calendar_id?: string
          created_at?: string
          id?: string
          last_sync_at?: string | null
          provider?: string
          refresh_token?: string
          scope?: string | null
          token_expires_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_goals: {
        Row: {
          count_type: string
          created_at: string
          id: string
          metric_key: string
          period_key: string | null
          scope: string
          set_by: string | null
          target_value: number
          updated_at: string
          user_id: string
        }
        Insert: {
          count_type?: string
          created_at?: string
          id?: string
          metric_key: string
          period_key?: string | null
          scope?: string
          set_by?: string | null
          target_value?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          count_type?: string
          created_at?: string
          id?: string
          metric_key?: string
          period_key?: string | null
          scope?: string
          set_by?: string | null
          target_value?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_goals_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vedouci_goals: {
        Row: {
          budouci_vedouci_count_goal: number
          budouci_vedouci_count_scope: string
          budouci_vedouci_count_type: string
          created_at: string
          garant_count_goal: number
          garant_count_scope: string
          garant_count_type: string
          id: string
          period_key: string
          personal_bj_goal: number
          selected_goal_1: string
          selected_goal_2: string
          team_bj_goal: number
          updated_at: string
          user_id: string
          vedouci_count_goal: number
          vedouci_count_scope: string
          vedouci_count_type: string
          ziskatel_count_goal: number
          ziskatel_count_scope: string
          ziskatel_count_type: string
        }
        Insert: {
          budouci_vedouci_count_goal?: number
          budouci_vedouci_count_scope?: string
          budouci_vedouci_count_type?: string
          created_at?: string
          garant_count_goal?: number
          garant_count_scope?: string
          garant_count_type?: string
          id?: string
          period_key: string
          personal_bj_goal?: number
          selected_goal_1?: string
          selected_goal_2?: string
          team_bj_goal?: number
          updated_at?: string
          user_id: string
          vedouci_count_goal?: number
          vedouci_count_scope?: string
          vedouci_count_type?: string
          ziskatel_count_goal?: number
          ziskatel_count_scope?: string
          ziskatel_count_type?: string
        }
        Update: {
          budouci_vedouci_count_goal?: number
          budouci_vedouci_count_scope?: string
          budouci_vedouci_count_type?: string
          created_at?: string
          garant_count_goal?: number
          garant_count_scope?: string
          garant_count_type?: string
          id?: string
          period_key?: string
          personal_bj_goal?: number
          selected_goal_1?: string
          selected_goal_2?: string
          team_bj_goal?: number
          updated_at?: string
          user_id?: string
          vedouci_count_goal?: number
          vedouci_count_scope?: string
          vedouci_count_type?: string
          ziskatel_count_goal?: number
          ziskatel_count_scope?: string
          ziskatel_count_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "vedouci_goals_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_billing: {
        Row: {
          billing_start: string | null
          created_at: string
          grandfathered_until: string | null
          id: string
          notes: string | null
          org_unit_id: string
          plan: string
          price_base: number
          price_per_user: number
          updated_at: string
          users_included: number
        }
        Insert: {
          billing_start?: string | null
          created_at?: string
          grandfathered_until?: string | null
          id?: string
          notes?: string | null
          org_unit_id: string
          plan?: string
          price_base?: number
          price_per_user?: number
          updated_at?: string
          users_included?: number
        }
        Update: {
          billing_start?: string | null
          created_at?: string
          grandfathered_until?: string | null
          id?: string
          notes?: string | null
          org_unit_id?: string
          plan?: string
          price_base?: number
          price_per_user?: number
          updated_at?: string
          users_included?: number
        }
        Relationships: [
          {
            foreignKeyName: "workspace_billing_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: true
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
      workspace_payments: {
        Row: {
          amount_czk: number | null
          created_at: string
          description: string
          id: string
          members_snapshot: Json | null
          org_unit_id: string
          paid_at: string
          status: string
        }
        Insert: {
          amount_czk?: number | null
          created_at?: string
          description: string
          id?: string
          members_snapshot?: Json | null
          org_unit_id: string
          paid_at: string
          status?: string
        }
        Update: {
          amount_czk?: number | null
          created_at?: string
          description?: string
          id?: string
          members_snapshot?: Json | null
          org_unit_id?: string
          paid_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workspace_payments_org_unit_id_fkey"
            columns: ["org_unit_id"]
            isOneToOne: false
            referencedRelation: "org_units"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_workspace_invite_code: { Args: never; Returns: string }
      get_effective_promotion_rules: {
        Args: { _org_unit_id: string }
        Returns: {
          min_bj: number
          min_direct: number
          min_structure: number
          transition: string
        }[]
      }
      get_user_role: { Args: { _user_id: string }; Returns: string }
      get_workspace_members_for_onboarding: {
        Args: { _token: string }
        Returns: {
          full_name: string
          id: string
          role: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_in_vedouci_subtree: {
        Args: { _target_id: string; _vedouci_id: string }
        Returns: boolean
      }
      my_org_unit_id: { Args: never; Returns: string }
      sync_activity_from_meetings: {
        Args: { p_user_id: string; p_week_start: string }
        Returns: undefined
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
  public: {
    Enums: {},
  },
} as const
