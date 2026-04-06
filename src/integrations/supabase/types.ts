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
          kl_fsa_actual: number | null
          poh_actual: number | null
          poh_planned: number | null
          por_actual: number | null
          por_planned: number | null
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
          kl_fsa_actual?: number | null
          poh_actual?: number | null
          poh_planned?: number | null
          por_actual?: number | null
          por_planned?: number | null
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
          kl_fsa_actual?: number | null
          poh_actual?: number | null
          poh_planned?: number | null
          por_actual?: number | null
          por_planned?: number | null
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
          has_pohovor: boolean
          has_poradenstvi: boolean
          id: string
          location_detail: string | null
          location_type: string | null
          meeting_time: string | null
          meeting_type: string
          podepsane_bj: number
          pohovor_date: string | null
          pohovor_jde_dal: boolean | null
          poradenstvi_date: string | null
          poradenstvi_status: string | null
          potencial_bj: number | null
          poznamka: string | null
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
          has_pohovor?: boolean
          has_poradenstvi?: boolean
          id?: string
          location_detail?: string | null
          location_type?: string | null
          meeting_time?: string | null
          meeting_type: string
          podepsane_bj?: number
          pohovor_date?: string | null
          pohovor_jde_dal?: boolean | null
          poradenstvi_date?: string | null
          poradenstvi_status?: string | null
          potencial_bj?: number | null
          poznamka?: string | null
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
          has_pohovor?: boolean
          has_poradenstvi?: boolean
          id?: string
          location_detail?: string | null
          location_type?: string | null
          meeting_time?: string | null
          meeting_type?: string
          podepsane_bj?: number
          pohovor_date?: string | null
          pohovor_jde_dal?: boolean | null
          poradenstvi_date?: string | null
          poradenstvi_status?: string | null
          potencial_bj?: number | null
          poznamka?: string | null
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
            foreignKeyName: "client_meetings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_rules: {
        Row: {
          body_template: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          recipient_roles: string[]
          recipient_type: string
          send_in_app: boolean
          send_push: boolean
          title_template: string
          trigger_event: string
          updated_at: string
        }
        Insert: {
          body_template?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          recipient_roles?: string[]
          recipient_type?: string
          send_in_app?: boolean
          send_push?: boolean
          title_template?: string
          trigger_event: string
          updated_at?: string
        }
        Update: {
          body_template?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          recipient_roles?: string[]
          recipient_type?: string
          send_in_app?: boolean
          send_push?: boolean
          title_template?: string
          trigger_event?: string
          updated_at?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          deadline: string
          id: string
          message: string
          read: boolean
          recipient_id: string
          related_case_id: string | null
          related_meeting_id: string | null
          reminder_sent: boolean
          sender_id: string
          title: string
          type: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          deadline: string
          id?: string
          message?: string
          read?: boolean
          recipient_id: string
          related_case_id?: string | null
          related_meeting_id?: string | null
          reminder_sent?: boolean
          sender_id: string
          title: string
          type?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          deadline?: string
          id?: string
          message?: string
          read?: boolean
          recipient_id?: string
          related_case_id?: string | null
          related_meeting_id?: string | null
          reminder_sent?: boolean
          sender_id?: string
          title?: string
          type?: string
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
            foreignKeyName: "notifications_related_case_id_fkey"
            columns: ["related_case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_related_meeting_id_fkey"
            columns: ["related_meeting_id"]
            isOneToOne: false
            referencedRelation: "client_meetings"
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
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          full_name: string
          garant_id: string | null
          id: string
          is_active: boolean | null
          is_admin: boolean
          monthly_bj_goal: number | null
          onboarding_completed: boolean | null
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
          monthly_bj_goal?: number | null
          onboarding_completed?: boolean | null
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
          monthly_bj_goal?: number | null
          onboarding_completed?: boolean | null
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
      push_subscriptions: {
        Row: {
          created_at: string
          id: string
          subscription: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          subscription: Json
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          subscription?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vedouci_goals: {
        Row: {
          budouci_vedouci_count_goal: number
          budouci_vedouci_count_scope: string
          created_at: string
          garant_count_goal: number
          garant_count_scope: string
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
        }
        Insert: {
          budouci_vedouci_count_goal?: number
          budouci_vedouci_count_scope?: string
          created_at?: string
          garant_count_goal?: number
          garant_count_scope?: string
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
        }
        Update: {
          budouci_vedouci_count_goal?: number
          budouci_vedouci_count_scope?: string
          created_at?: string
          garant_count_goal?: number
          garant_count_scope?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: { Args: { _user_id: string }; Returns: string }
      is_admin: { Args: never; Returns: boolean }
      is_in_vedouci_subtree: {
        Args: { _target_id: string; _vedouci_id: string }
        Returns: boolean
      }
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
