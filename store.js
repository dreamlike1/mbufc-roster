/**
 * Data layer backed by Supabase. Normalizes the three tables (schedules,
 * teams, players) into the flat { type, __backendId, ... } record shape
 * app.js expects, so app.js never needs to know Supabase exists.
 */
(function () {
  const SUPABASE_URL = "https://rgucksrbfynijxuckilc.supabase.co";
  const SUPABASE_KEY = "sb_publishable_-CJHXPTZPX_mYQ13yHshKA_zqzCr-3e";

  const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

  let handler = null;
  const cache = { schedules: [], teams: [], players: [] };

  function toRecords() {
    const scheduleRecords = cache.schedules.map((row) => ({
      __backendId: row.id,
      type: "schedule",
      schedule_date: row.schedule_date,
      schedule_time: row.schedule_time || "",
    }));
    const teamRecords = cache.teams.map((row) => ({
      __backendId: row.id,
      type: "team",
      name: row.name,
    }));
    const playerRecords = cache.players.map((row) => ({
      __backendId: row.id,
      type: "player",
      name: row.name,
      team_id: row.team_id || "",
      status: row.status || "invited",
    }));
    return [...scheduleRecords, ...teamRecords, ...playerRecords];
  }

  function notify() {
    if (handler) handler.onDataChanged(toRecords());
  }

  async function loadAll() {
    const [schedulesRes, teamsRes, playersRes] = await Promise.all([
      client.from("schedules").select("*"),
      client.from("teams").select("*"),
      client.from("players").select("*"),
    ]);
    cache.schedules = schedulesRes.data || [];
    cache.teams = teamsRes.data || [];
    cache.players = playersRes.data || [];
    notify();
  }

  function tableForType(type) {
    if (type === "schedule") return "schedules";
    if (type === "team") return "teams";
    return "players";
  }

  function toRow(record) {
    if (record.type === "schedule") {
      return { schedule_date: record.schedule_date, schedule_time: record.schedule_time || null };
    }
    if (record.type === "team") {
      return { name: record.name };
    }
    return { name: record.name, team_id: record.team_id || null, status: record.status || "invited" };
  }

  window.dataSdk = {
    async init(dataHandler) {
      handler = dataHandler;
      await loadAll();

      client
        .channel("mbufc-changes")
        .on("postgres_changes", { event: "*", schema: "public", table: "schedules" }, loadAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "teams" }, loadAll)
        .on("postgres_changes", { event: "*", schema: "public", table: "players" }, loadAll)
        .subscribe();

      return { isOk: true };
    },

    async create(record) {
      const { error } = await client.from(tableForType(record.type)).insert(toRow(record));
      if (error) return { isOk: false, error };
      await loadAll();
      return { isOk: true };
    },

    async update(record) {
      const { error } = await client.from(tableForType(record.type)).update(toRow(record)).eq("id", record.__backendId);
      if (error) return { isOk: false, error };
      await loadAll();
      return { isOk: true };
    },

    async delete(record) {
      const { error } = await client.from(tableForType(record.type)).delete().eq("id", record.__backendId);
      if (error) return { isOk: false, error };
      await loadAll();
      return { isOk: true };
    },

    async isSignedIn() {
      const { data } = await client.auth.getSession();
      return Boolean(data.session);
    },

    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email, password });
      return { isOk: !error };
    },

    async signOut() {
      await client.auth.signOut();
    },
  };
})();
