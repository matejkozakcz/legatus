import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface GroupParty {
  id: string;
  name: string;
  host_id: string;
  org_unit_id: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  ended_at: string | null;
  planned_duration_min: number | null;
  status: "scheduled" | "live" | "ended";
  join_token: string;
  goals: { calls?: number; meetings?: number; FSA?: number; SER?: number; POH?: number; NAB?: number };
  allow_external: boolean;
  notes: string | null;
}

export interface Participant {
  id: string;
  party_id: string;
  user_id: string;
  joined_at: string;
  left_at: string | null;
  invited_via: string;
  role: "host" | "caller";
  full_name?: string;
  avatar_url?: string | null;
}

export interface PartyEntry {
  id: string;
  session_id: string;
  client_name: string;
  outcome: "nezvedl" | "nedomluveno" | "domluveno";
  meeting_type: string | null;
  created_at: string;
  user_id: string;
  user_name?: string;
}

/** Hook: live data for one group party — party, participants, entries (across all participants). */
export function useGroupParty(partyId: string | null) {
  const partyQuery = useQuery({
    queryKey: ["group_party", partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_call_parties")
        .select("*")
        .eq("id", partyId!)
        .maybeSingle();
      if (error) throw error;
      return data as GroupParty | null;
    },
    refetchInterval: 10_000,
  });

  const participantsQuery = useQuery({
    queryKey: ["group_party_participants", partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("group_call_party_participants")
        .select("*")
        .eq("party_id", partyId!);
      if (error) throw error;
      const userIds = (data || []).map((d: any) => d.user_id);
      if (userIds.length === 0) return [] as Participant[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", userIds);
      const pm = new Map((profiles || []).map((p: any) => [p.id, p]));
      return (data || []).map((d: any) => ({
        ...d,
        full_name: pm.get(d.user_id)?.full_name ?? "—",
        avatar_url: pm.get(d.user_id)?.avatar_url ?? null,
      })) as Participant[];
    },
  });

  // Sessions linked to this party (for fetching entries)
  const sessionsQuery = useQuery({
    queryKey: ["group_party_sessions", partyId],
    enabled: !!partyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_party_sessions")
        .select("id, user_id")
        .eq("group_party_id", partyId!);
      if (error) throw error;
      return data as { id: string; user_id: string }[];
    },
    refetchInterval: 5_000,
  });

  const sessionIds = useMemo(() => (sessionsQuery.data || []).map((s) => s.id), [sessionsQuery.data]);
  const sessionUserMap = useMemo(() => {
    const m = new Map<string, string>();
    (sessionsQuery.data || []).forEach((s) => m.set(s.id, s.user_id));
    return m;
  }, [sessionsQuery.data]);

  const entriesQuery = useQuery({
    queryKey: ["group_party_entries", partyId, sessionIds],
    enabled: !!partyId && sessionIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("call_party_entries")
        .select("id, session_id, client_name, outcome, meeting_type, created_at")
        .in("session_id", sessionIds)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []).map((e: any) => ({
        ...e,
        user_id: sessionUserMap.get(e.session_id) ?? "",
      })) as PartyEntry[];
    },
    refetchInterval: 4_000,
  });

  // Realtime subscriptions
  useEffect(() => {
    if (!partyId) return;
    const ch = supabase
      .channel(`group_party_${partyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_call_parties", filter: `id=eq.${partyId}` },
        () => partyQuery.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "group_call_party_participants", filter: `party_id=eq.${partyId}` },
        () => participantsQuery.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_party_sessions", filter: `group_party_id=eq.${partyId}` },
        () => sessionsQuery.refetch(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "call_party_entries" },
        (payload: any) => {
          const sid = payload.new?.session_id ?? payload.old?.session_id;
          if (sid && sessionIds.includes(sid)) entriesQuery.refetch();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyId, sessionIds.join(",")]);

  // Enrich entries with user names from participants
  const entriesEnriched = useMemo(() => {
    const nm = new Map((participantsQuery.data || []).map((p) => [p.user_id, p.full_name]));
    return (entriesQuery.data || []).map((e) => ({ ...e, user_name: nm.get(e.user_id) ?? "—" }));
  }, [entriesQuery.data, participantsQuery.data]);

  return {
    party: partyQuery.data,
    participants: participantsQuery.data || [],
    entries: entriesEnriched,
    isLoading: partyQuery.isLoading || participantsQuery.isLoading,
    refetchAll: () => {
      partyQuery.refetch();
      participantsQuery.refetch();
      sessionsQuery.refetch();
      entriesQuery.refetch();
    },
  };
}

/** List parties relevant to current user (host or participant or in subtree). */
export function useMyGroupParties(userId: string | null) {
  return useQuery({
    queryKey: ["my_group_parties", userId],
    enabled: !!userId,
    queryFn: async () => {
      // Hosted by me
      const { data: hosted } = await supabase
        .from("group_call_parties")
        .select("*")
        .eq("host_id", userId!)
        .order("created_at", { ascending: false });

      // Where I'm a participant
      const { data: parts } = await supabase
        .from("group_call_party_participants")
        .select("party_id")
        .eq("user_id", userId!);
      const partyIds = (parts || []).map((p: any) => p.party_id);
      let participated: any[] = [];
      if (partyIds.length > 0) {
        const { data } = await supabase
          .from("group_call_parties")
          .select("*")
          .in("id", partyIds)
          .order("created_at", { ascending: false });
        participated = data || [];
      }

      const map = new Map<string, GroupParty>();
      [...(hosted || []), ...participated].forEach((p) => map.set(p.id, p as GroupParty));
      return Array.from(map.values()).sort((a, b) => {
        // live first, then scheduled, then ended; recent first
        const order = { live: 0, scheduled: 1, ended: 2 };
        const oa = order[a.status];
        const ob = order[b.status];
        if (oa !== ob) return oa - ob;
        return (b.scheduled_at || "").localeCompare(a.scheduled_at || "");
      });
    },
    refetchInterval: 30_000,
  });
}

/** Compute leaderboard from entries */
export function buildLeaderboard(entries: PartyEntry[], participants: Participant[]) {
  const map = new Map<string, {
    user_id: string;
    name: string;
    avatar: string | null;
    calls: number;
    meetings: number;
    fsa: number;
    ser: number;
    poh: number;
    nab: number;
  }>();
  participants.forEach((p) =>
    map.set(p.user_id, {
      user_id: p.user_id,
      name: p.full_name || "—",
      avatar: p.avatar_url ?? null,
      calls: 0, meetings: 0, fsa: 0, ser: 0, poh: 0, nab: 0,
    }),
  );
  entries.forEach((e) => {
    const row = map.get(e.user_id);
    if (!row) return;
    row.calls += 1;
    if (e.outcome === "domluveno") {
      row.meetings += 1;
      if (e.meeting_type === "FSA") row.fsa += 1;
      if (e.meeting_type === "SER") row.ser += 1;
      if (e.meeting_type === "POH") row.poh += 1;
      if (e.meeting_type === "NAB") row.nab += 1;
    }
  });
  return Array.from(map.values());
}

/** Aggregate totals across all entries */
export function buildTotals(entries: PartyEntry[]) {
  const t = { calls: 0, meetings: 0, FSA: 0, SER: 0, POH: 0, NAB: 0 };
  entries.forEach((e) => {
    t.calls += 1;
    if (e.outcome === "domluveno") {
      t.meetings += 1;
      if (e.meeting_type && e.meeting_type in t) (t as any)[e.meeting_type] += 1;
    }
  });
  return t;
}
