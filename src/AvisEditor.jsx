import { useEffect, useMemo, useRef, useState } from "react";
import { loadGoogleMaps } from "./lib/googleMaps.js";
import { loadSpots, saveSpots, downloadSpots } from "./lib/storage.js";
import DevNav from "./DevNav.jsx";
import SPOTS from "./data/spots.json";

// Detail-panel width (the draggable right section), persisted across sessions.
const WKEY = "cgv_avis_panelw_v1";
const WMIN = 360;
const WMAX = 820;
const WDEF = 460;

// Build the working set: the committed spots.json is the source of truth (it
// carries every spot and its text); we also keep any locally-curated spot
// whose id isn't in the file yet, so uncommitted curations aren't lost.
function seedWorking() {
  const byId = new Map(SPOTS.map((s) => [s.id, { ...s }]));
  for (const s of loadSpots()) if (!byId.has(s.id)) byId.set(s.id, { ...s });
  return [...byId.values()];
}

const PANO_OPTIONS = {
  clickToGo: false,
  linksControl: false,
  showRoadLabels: false,
  addressControl: false,
  fullscreenControl: false,
  motionTracking: false,
  motionTrackingControl: false,
  enableCloseButton: false,
  panControl: true,
  zoomControl: true,
};

const hasText = (s) =>
  typeof s.description === "string" && s.description.trim() !== "";

export default function AvisEditor() {
  const [status, setStatus] = useState("init"); // init | no-key | error | ready
  const [errorMsg, setErrorMsg] = useState("");
  const [spots, setSpots] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all"); // all | with | without
  const [query, setQuery] = useState("");
  const [panelW, setPanelW] = useState(() => {
    const s = Number(localStorage.getItem(WKEY));
    return s >= WMIN && s <= WMAX ? s : WDEF;
  });

  const googleRef = useRef(null);
  const panoDivRef = useRef(null);
  const panoRef = useRef(null);
  const mapDivRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);
  const detailRef = useRef(null);

  // Drag the handle to set the table / edit-panel ratio. During the drag we
  // mutate the DOM directly (no React re-render, so the Google map/pano aren't
  // disturbed) and only commit the width + resize them on release.
  function startResize(e) {
    e.preventDefault();
    const handle = e.currentTarget;
    handle.setPointerCapture(e.pointerId);
    let w = panelW;
    const onMove = (ev) => {
      w = Math.min(WMAX, Math.max(WMIN, window.innerWidth - ev.clientX));
      if (detailRef.current) detailRef.current.style.flex = `0 0 ${w}px`;
    };
    const onUp = (ev) => {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setPanelW(w);
      localStorage.setItem(WKEY, String(w));
      const g = googleRef.current;
      if (g && mapRef.current) g.maps.event.trigger(mapRef.current, "resize");
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  // Boot Google Maps and seed the working set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const google = await loadGoogleMaps();
        if (cancelled) return;
        googleRef.current = google;
      } catch (e) {
        if (e.message === "MISSING_KEY") setStatus("no-key");
        else {
          setStatus("error");
          setErrorMsg(String(e.message || e));
        }
        return;
      }
      const working = seedWorking();
      saveSpots(working); // normalise the local store to the full set
      setSpots(working);
      setStatus("ready");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = spots.find((s) => s.id === selectedId) || null;

  // Drive the Street View panorama and the location map from the selection.
  useEffect(() => {
    const g = googleRef.current;
    if (!g || !selected) return;

    if (!panoRef.current && panoDivRef.current) {
      panoRef.current = new g.maps.StreetViewPanorama(
        panoDivRef.current,
        PANO_OPTIONS
      );
    }
    if (panoRef.current) {
      panoRef.current.setPano(selected.id);
      panoRef.current.setPov({
        heading: selected.heading ?? 0,
        pitch: selected.pitch ?? 0,
      });
      panoRef.current.setZoom(selected.zoom ?? 0);
    }

    const pos = { lat: selected.lat, lng: selected.lng };
    if (!mapRef.current && mapDivRef.current) {
      mapRef.current = new g.maps.Map(mapDivRef.current, {
        center: pos,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
      });
      markerRef.current = new g.maps.Marker({ map: mapRef.current });
    }
    if (mapRef.current) {
      mapRef.current.setCenter(pos);
      markerRef.current.setPosition(pos);
    }
  }, [selectedId, selected]);

  function updateSpot(id, patch) {
    setSpots((prev) => {
      const next = prev.map((s) => (s.id === id ? { ...s, ...patch } : s));
      saveSpots(next);
      return next;
    });
  }

  function reseedFromFile() {
    if (
      !confirm(
        "Recharger depuis spots.json ? Les modifications locales non exportées seront perdues."
      )
    )
      return;
    const fresh = SPOTS.map((s) => ({ ...s }));
    saveSpots(fresh);
    setSpots(fresh);
    setSelectedId(null);
  }

  const counts = useMemo(() => {
    const withText = spots.filter(hasText).length;
    return { total: spots.length, withText, without: spots.length - withText };
  }, [spots]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return spots.filter((s) => {
      if (filter === "with" && !hasText(s)) return false;
      if (filter === "without" && hasText(s)) return false;
      if (q && !(s.description || "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [spots, filter, query]);

  // --- Render states ---------------------------------------------------------

  if (status === "no-key") {
    return (
      <div className="screen">
        <div className="card">
          <h1>Clé API manquante</h1>
          <p>
            Crée un fichier <code>.env.local</code> à la racine avec :
          </p>
          <pre>VITE_GMAPS_KEY=ta_cle_ici</pre>
          <p>Puis relance le serveur de dev.</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="screen">
        <div className="card">
          <h1>Erreur</h1>
          <pre>{errorMsg}</pre>
        </div>
      </div>
    );
  }

  if (status === "init") {
    return (
      <div className="screen">
        <div className="card">
          <h1>Ce qu'il faut savoir</h1>
          <p>Chargement…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <strong>Ce qu'il faut savoir : édition</strong>
        <span className="counts">
          {counts.total} spots · {counts.withText} rédigés ·{" "}
          {counts.without} à faire
        </span>
        <span className="actions">
          <DevNav current="avis" />
          <button onClick={() => downloadSpots(spots)} disabled={!spots.length}>
            Exporter spots.json
          </button>
          <button className="ghost" onClick={reseedFromFile}>
            Recharger depuis le fichier
          </button>
        </span>
      </header>

      <div className="avis-layout">
        <div className="avis-list">
          <div className="avis-filters">
            <input
              className="avis-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher dans les textes…"
            />
            <div className="avis-segmented">
              {[
                ["all", `Tous (${counts.total})`],
                ["with", `Rédigés (${counts.withText})`],
                ["without", `À faire (${counts.without})`],
              ].map(([key, label]) => (
                <button
                  key={key}
                  className={filter === key ? "active" : ""}
                  onClick={() => setFilter(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="avis-table">
            {visible.map((s) => (
              <button
                key={s.id}
                className={`avis-row${s.id === selectedId ? " selected" : ""}`}
                onClick={() => setSelectedId(s.id)}
              >
                {/* Filled dot = a text has been written for this spot. */}
                <span className={`avis-dot${hasText(s) ? " done" : ""}`}>
                  {hasText(s) ? "●" : "·"}
                </span>
                <span className="avis-text">
                  {hasText(s) ? (
                    s.description
                  ) : (
                    <em className="muted">(à rédiger)</em>
                  )}
                </span>
              </button>
            ))}
            {!visible.length && (
              <p className="muted avis-empty">Aucun spot pour ce filtre.</p>
            )}
          </div>
        </div>

        <div
          className="avis-resizer"
          onPointerDown={startResize}
          title="Glisser pour régler la largeur"
        />

        <aside
          className="avis-detail"
          ref={detailRef}
          style={{ flex: `0 0 ${panelW}px` }}
        >
          {!selected ? (
            <div className="avis-placeholder muted">
              Sélectionne un spot dans la liste pour voir son Street View, sa
              position, et rédiger son texte.
            </div>
          ) : (
            <>
              <div className="avis-pano" ref={panoDivRef} />
              <div className="avis-map" ref={mapDivRef} />

              <label className="field">
                Ce qu'il faut savoir
                <textarea
                  value={selected.description || ""}
                  onChange={(e) =>
                    updateSpot(selected.id, { description: e.target.value })
                  }
                  placeholder="Ce qui se passe ici, ce que dit le code de la route, ce que tu as le droit de faire…"
                  rows={6}
                />
              </label>

              <p className="avis-hint muted">
                Modifs enregistrées en local. Pense à « Exporter spots.json » et
                à committer le fichier pour les retrouver dans le jeu.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
