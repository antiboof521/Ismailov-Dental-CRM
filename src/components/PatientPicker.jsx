/**
 * PatientPicker.jsx — qidiruvli bemor tanlash
 */

import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { useLang } from "../i18n.jsx";

export default function PatientPicker({ value, onChange }) {
  const { t } = useLang();
  const [patients, setPatients] = useState([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.get("/api/patients?limit=200")
      .then((d) => setPatients(d.patients || []))
      .catch(() => setPatients([]));
  }, []);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return patients;
    return patients.filter(
      (p) => (p.full_name || "").toLowerCase().includes(s) || (p.phone || "").includes(s)
    );
  }, [patients, search]);

  return (
    <div className="form-row">
      <input
        placeholder={t("search")}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value ? parseInt(e.target.value, 10) : null)}
        size={6}
        style={{ height: 140 }}
      >
        {filtered.slice(0, 100).map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name} {p.phone ? `— ${p.phone}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
