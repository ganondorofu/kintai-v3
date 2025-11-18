export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  attendance: {
    Tables: {
      announcements: {
        Row: {
          author_id: string | null
          content: string
          created_at: string
          id: string
          is_active: boolean
          is_current: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_current?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "announcements_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
            referencedSchema: "member"
          },
        ]
      }
      attendances: {
        Row: {
          created_at: string
          date: string
          id: string
          timestamp: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          timestamp?: string
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          timestamp?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendances_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_logout_logs: {
        Row: {
          affected_count: number
          executed_at: string
          id: string
          status: string
        }
        Insert: {
          affected_count: number
          executed_at?: string
          id?: string
          status: string
        }
        Update: {
          affected_count?: number
          executed_at?: string
          id?: string
          status?: string
        }
        Relationships: []
      }
      temp_registrations: {
        Row: {
          accessed_at: string | null
          card_id: string
          created_at: string
          expires_at: string
          id: string
          is_used: boolean
          qr_token: string
        }
        Insert: {
          accessed_at?: string | null
          card_id: string
          created_at?: string
          expires_at: string
          id?: string
          is_used?: boolean
          qr_token: string
        }
        Update: {
          accessed_at?: string | null
          card_id?: string
          created_at?: string
          expires_at?: string
          id?: string
          is_used?: boolean
          qr_token?: string
        }
        Relationships: []
      }
      user_edit_logs: {
        Row: {
          created_at: string
          editor_user_id: string | null
          field_name: string
          id: string
          new_value: string | null
          old_value: string | null
          target_user_id: string
        }
        Insert: {
          created_at?: string
          editor_user_id?: string | null
          field_name: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id: string
        }
        Update: {
          created_at?: string
          editor_user_id?: string | null
          field_name?: string
          id?: string
          new_value?: string | null
          old_value?: string | null
          target_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_edit_logs_editor_user_id_fkey"
            columns: ["editor_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
            referencedSchema: "member"
          },
          {
            foreignKeyName: "user_edit_logs_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
            referencedSchema: "member"
          },
        ]
      }
      users: {
        Row: {
          card_id: string
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          card_id: string
          created_at?: string
          id: string
          updated_at?: string
        }
        Update: {
          card_id?: string
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
            referencedSchema: "member"
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: never
    CompositeTypes: never
  }
  member: {
    Tables: {
      generation_roles: {
        Row: {
          discord_role_id: string
          generation: number
        }
        Insert: {
          discord_role_id: string
          generation: number
        }
        Update: {
          discord_role_id?: string
          generation?: number
        }
        Relationships: []
      }
      member_team_relations: {
        Row: {
          created_at: string
          member_id: string
          team_id: number
        }
        Insert: {
          created_at?: string
          member_id: string
          team_id: number
        }
        Update: {
          created_at?: string
          member_id?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "member_team_relations_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "member_team_relations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_leaders: {
        Row: {
          member_id: string
          team_id: number
        }
        Insert: {
          member_id: string
          team_id: number
        }
        Update: {
          member_id?: string
          team_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "team_leaders_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_leaders_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          created_at: string
          discord_role_id: string | null
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          discord_role_id?: string | null
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          discord_role_id?: string | null
          id?: number
          name?: string
        }
        Relationships: []
      }
      users: {
        Row: {
          created_at: string
          deleted_at: string | null
          discord_id: string
          display_name: string
          generation: number
          id: string
          is_admin: boolean
          status: number
          student_number: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          discord_id: string
          display_name: string
          generation: number
          id: string
          is_admin?: boolean
          status: number
          student_number?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          discord_id?: string
          display_name?: string
          generation?: number
          id?: string
          is_admin?: boolean
          status?: number
          student_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_id_fkey"
            columns: ["id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: never
    CompositeTypes: never
  }
}

type PublicSchema = keyof (Database)

export type Tables<
  SchemaName extends PublicSchema,
  TableName extends keyof (Database[SchemaName]["Tables"] &
    Database[SchemaName]["Views"])
> = (Database[SchemaName]["Tables"] &
  Database[SchemaName]["Views"])[TableName] extends {
  Row: infer R
}
  ? R
  : never

export type TablesInsert<
  SchemaName extends PublicSchema,
  TableName extends keyof Database[SchemaName]["Tables"]
> = Database[SchemaName]["Tables"][TableName] extends {
  Insert: infer I
}
  ? I
  : never

export type TablesUpdate<
  SchemaName extends PublicSchema,
  TableName extends keyof Database[SchemaName]["Tables"]
> = Database[SchemaName]["Tables"][TableName] extends {
  Update: infer U
}
  ? U
  : never

export type Enums<
  SchemaName extends PublicSchema,
  EnumName extends keyof Database[SchemaName]["Enums"]
> = Database[SchemaName]["Enums"][EnumName]
