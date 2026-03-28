"use client";

import { useEffect, useRef, useCallback } from "react";
import Script from "next/script";
import type { ComputedDashboardData } from "./page";

// ---------------------------------------------------------------------------
// We declare the global Chart and d3 types loosely since they come from CDN
// ---------------------------------------------------------------------------
/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    Chart: any;
    d3: any;
  }
}

interface Props {
  data: ComputedDashboardData;
}

export default function DashboardClient({ data }: Props) {
  const chartInstancesRef = useRef<Record<string, any>>({});
  const d3LoadedRef = useRef(false);
  const chartJsLoadedRef = useRef(false);
  const mainRef = useRef<HTMLDivElement>(null);

  // ---------------------------------------------------------------------------
  // Helper: first sentence extraction for collapsed previews
  // ---------------------------------------------------------------------------
  function firstSentence(text: string): string {
    const clean = text.replace(/<[^>]+>/g, " ").trim();
    const m = clean.match(/^([^.!?]+[.!?])/);
    return m ? m[1].trim() : clean.slice(0, 80);
  }

  // ---------------------------------------------------------------------------
  // Chart.js helpers
  // ---------------------------------------------------------------------------
  const getSignalColor = useCallback((card: HTMLElement): string => {
    const sig = card.dataset.signal;
    if (sig === "bullish") return "#00e676";
    if (sig === "bearish") return "#ff4d4d";
    return "#ffd24d";
  }, []);

  const filterByPeriod = useCallback(
    (hist: [string, number][], period: string): [string, number][] => {
      if (!hist || hist.length === 0) return hist;
      const now = new Date();
      const cutoff = new Date();
      switch (period) {
        case "1W": cutoff.setDate(now.getDate() - 7); break;
        case "1M": cutoff.setMonth(now.getMonth() - 1); break;
        case "3M": cutoff.setMonth(now.getMonth() - 3); break;
        case "6M": cutoff.setMonth(now.getMonth() - 6); break;
        case "1Y": cutoff.setFullYear(now.getFullYear() - 1); break;
      }
      const cutoffStr = cutoff.toISOString().split("T")[0];
      return hist.filter((d) => d[0] >= cutoffStr);
    },
    [],
  );

  const formatDateLabel = useCallback((dateStr: string): string => {
    const d = new Date(dateStr + "T00:00:00");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return d.getDate() + " " + months[d.getMonth()];
  }, []);

  const renderChart = useCallback(
    (card: HTMLElement, period: string) => {
      if (!window.Chart) return;
      const key = card.dataset.key;
      if (!key) return;
      const hist = data.historyData[key];
      if (!hist || hist.length === 0) return;

      const filtered = filterByPeriod(hist, period);
      if (filtered.length === 0) return;

      const canvas = card.querySelector(".chart-canvas") as HTMLCanvasElement | null;
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const color = getSignalColor(card);

      if (chartInstancesRef.current[key]) {
        chartInstancesRef.current[key].destroy();
      }

      chartInstancesRef.current[key] = new window.Chart(ctx, {
        type: "line",
        data: {
          labels: filtered.map((d: [string, number]) => d[0]),
          datasets: [
            {
              data: filtered.map((d: [string, number]) => d[1]),
              borderColor: color,
              backgroundColor: color + "1a",
              borderWidth: 1.5,
              pointRadius: 0,
              pointHoverRadius: 4,
              pointHoverBackgroundColor: color,
              fill: true,
              tension: 0.3,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false },
            tooltip: {
              mode: "index",
              intersect: false,
              backgroundColor: "#1c2540",
              titleColor: "#e8eaf2",
              bodyColor: "#e8eaf2",
              borderColor: "#252e4a",
              borderWidth: 1,
              titleFont: { family: "'JetBrains Mono', monospace", size: 11 },
              bodyFont: { family: "'JetBrains Mono', monospace", size: 11 },
              callbacks: {
                title: function (items: any[]) {
                  return formatDateLabel(items[0].label);
                },
                label: function (ctx2: any) {
                  return (
                    "  " +
                    ctx2.parsed.y.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })
                  );
                },
              },
            },
          },
          scales: {
            x: {
              grid: { color: "#1f2937", drawBorder: false },
              ticks: {
                color: "#8892b0",
                maxTicksLimit: 6,
                font: { size: 10, family: "'JetBrains Mono', monospace" },
                callback: function (this: any, _val: any, _idx: any) {
                  return formatDateLabel(this.getLabelForValue(_val));
                },
              },
            },
            y: {
              grid: { color: "#1f2937", drawBorder: false },
              ticks: {
                color: "#8892b0",
                font: { size: 10, family: "'JetBrains Mono', monospace" },
              },
            },
          },
          interaction: {
            mode: "nearest",
            axis: "x",
            intersect: false,
          },
        },
      });
    },
    [data.historyData, filterByPeriod, formatDateLabel, getSignalColor],
  );

  // ---------------------------------------------------------------------------
  // Related indicators
  // ---------------------------------------------------------------------------
  const populateRelated = useCallback(
    (card: HTMLElement) => {
      const key = card.dataset.key;
      if (!key) return;
      const section = card.querySelector(".related-section");
      if (!section) return;
      const related = data.correlations[key] || [];
      if (related.length === 0) {
        section.innerHTML = "";
        return;
      }
      let html = '<span class="related-label">Related:</span>';
      related.forEach((rk: string) => {
        const meta = data.indMeta[rk];
        if (!meta) return;
        const dir = meta.direction;
        const arrowCls = dir === "\u25b2" ? "up" : dir === "\u25bc" ? "down" : "flat";
        html +=
          `<span class="related-chip" data-action="scrollToCard" data-target="${rk}">` +
          `<span class="rel-arrow ${arrowCls}">${dir}</span>` +
          `${meta.label}` +
          `<span class="rel-val">${meta.value}</span>` +
          `</span>`;
      });
      section.innerHTML = html;
    },
    [data.correlations, data.indMeta],
  );

  // ---------------------------------------------------------------------------
  // scrollToCard
  // ---------------------------------------------------------------------------
  const scrollToCard = useCallback(
    (key: string) => {
      const card = document.querySelector(`.card[data-key="${key}"]`) as HTMLElement | null;
      if (!card) return;
      // Collapse all expanded
      document.querySelectorAll<HTMLElement>(".card.expanded").forEach((c) => {
        c.classList.remove("expanded");
        const k = c.dataset.key;
        if (k && chartInstancesRef.current[k]) {
          chartInstancesRef.current[k].destroy();
          delete chartInstancesRef.current[k];
        }
      });
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => {
        card.classList.add("expanded");
        card.querySelectorAll<HTMLElement>(".period-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.period === "3M");
        });
        requestAnimationFrame(() => renderChart(card, "3M"));
        populateRelated(card);
      }, 400);
    },
    [renderChart, populateRelated],
  );

  // ---------------------------------------------------------------------------
  // toggleChart
  // ---------------------------------------------------------------------------
  const toggleChart = useCallback(
    (card: HTMLElement) => {
      if (document.body.classList.contains("edit-mode")) return;
      if (card.dataset.hasHistory === "false") return;

      const wasExpanded = card.classList.contains("expanded");

      // Collapse all
      document.querySelectorAll<HTMLElement>(".card.expanded").forEach((c) => {
        c.classList.remove("expanded");
        const k = c.dataset.key;
        if (k && chartInstancesRef.current[k]) {
          chartInstancesRef.current[k].destroy();
          delete chartInstancesRef.current[k];
        }
      });

      if (!wasExpanded) {
        card.classList.add("expanded");
        card.querySelectorAll<HTMLElement>(".period-btn").forEach((btn) => {
          btn.classList.toggle("active", btn.dataset.period === "3M");
        });
        requestAnimationFrame(() => renderChart(card, "3M"));
        populateRelated(card);
      }
    },
    [renderChart, populateRelated],
  );

  // ---------------------------------------------------------------------------
  // D3 Macro Map
  // ---------------------------------------------------------------------------
  const renderMacroMap = useCallback(() => {
    const d3 = window.d3;
    if (!d3) return;
    const container = document.getElementById("macro-map-container");
    if (!container) return;
    const width = container.clientWidth || 1200;
    const height = 600;
    container.innerHTML = "";

    const svg = d3.select(container).append("svg").attr("width", width).attr("height", height);

    svg
      .append("defs")
      .append("marker")
      .attr("id", "arrowhead")
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 25)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("path")
      .attr("d", "M0,-5L10,0L0,5")
      .attr("fill", "#667194");

    const nodes = JSON.parse(JSON.stringify(data.macroMapNodes));
    const edges = JSON.parse(JSON.stringify(data.macroMapEdges));

    const simulation = d3
      .forceSimulation(nodes)
      .force("link", d3.forceLink(edges).id((d: any) => d.id).distance(130).strength(0.4))
      .force("charge", d3.forceManyBody().strength(-350))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => d.radius + 8))
      .force("x", d3.forceX((d: any) => (d.ix * width) / 1100).strength(0.15))
      .force("y", d3.forceY((d: any) => (d.iy * height) / 600).strength(0.15));

    const link = svg.selectAll(".mm-link-g").data(edges).enter().append("g");
    const linkLine = link
      .append("line")
      .attr("stroke", "#667194")
      .attr("stroke-width", 1.5)
      .attr("stroke-opacity", 0.35)
      .attr("marker-end", "url(#arrowhead)");
    const linkLabel = link
      .append("text")
      .attr("text-anchor", "middle")
      .attr("fill", "#4a5278")
      .attr("font-size", "8px")
      .attr("font-family", "'DM Sans', sans-serif")
      .text((d: any) => d.label);

    const node = svg
      .selectAll(".mm-node")
      .data(nodes)
      .enter()
      .append("g")
      .style("cursor", "pointer")
      .call(
        d3
          .drag()
          .on("start", (e: any, d: any) => {
            if (!e.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (e: any, d: any) => {
            d.fx = e.x;
            d.fy = e.y;
          })
          .on("end", (e: any, d: any) => {
            if (!e.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          }),
      );

    node
      .append("circle")
      .attr("r", (d: any) => d.radius)
      .attr("fill", (d: any) => d.color + "33")
      .attr("stroke", (d: any) => d.color)
      .attr("stroke-width", 2);
    node
      .append("text")
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#e8eaf2")
      .attr("font-size", (d: any) => (d.radius > 22 ? "10px" : "8px"))
      .attr("font-family", "'JetBrains Mono', monospace")
      .attr("font-weight", "600")
      .text((d: any) => d.short);

    node
      .on("mouseover", function (_event: any, d: any) {
        const connected = new Set([d.id]);
        edges.forEach((e: any) => {
          const s = typeof e.source === "object" ? e.source.id : e.source;
          const t = typeof e.target === "object" ? e.target.id : e.target;
          if (s === d.id) connected.add(t);
          if (t === d.id) connected.add(s);
        });
        node.select("circle").attr("opacity", (n: any) => (connected.has(n.id) ? 1 : 0.12));
        node.select("text").attr("opacity", (n: any) => (connected.has(n.id) ? 1 : 0.12));
        linkLine
          .attr("stroke-opacity", (e: any) => {
            const s = typeof e.source === "object" ? e.source.id : e.source;
            const t = typeof e.target === "object" ? e.target.id : e.target;
            return s === d.id || t === d.id ? 0.9 : 0.04;
          })
          .attr("stroke", (e: any) => {
            const s = typeof e.source === "object" ? e.source.id : e.source;
            const t = typeof e.target === "object" ? e.target.id : e.target;
            return s === d.id || t === d.id ? "#4d9fff" : "#667194";
          });
        linkLabel.attr("opacity", (e: any) => {
          const s = typeof e.source === "object" ? e.source.id : e.source;
          const t = typeof e.target === "object" ? e.target.id : e.target;
          return s === d.id || t === d.id ? 1 : 0.04;
        });
      })
      .on("mouseout", function () {
        node.select("circle").attr("opacity", 1);
        node.select("text").attr("opacity", 1);
        linkLine.attr("stroke-opacity", 0.35).attr("stroke", "#667194");
        linkLabel.attr("opacity", 1);
      })
      .on("click", function (_event: any, d: any) {
        const btn = document.querySelector(".macromap-btn") as HTMLElement | null;
        if (btn && btn.classList.contains("active")) btn.click();
        setTimeout(() => scrollToCard(d.id), 200);
      });

    simulation.on("tick", () => {
      nodes.forEach((d: any) => {
        d.x = Math.max(d.radius + 5, Math.min(width - d.radius - 5, d.x));
        d.y = Math.max(d.radius + 5, Math.min(height - d.radius - 5, d.y));
      });
      linkLine
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      linkLabel
        .attr("x", (d: any) => (d.source.x + d.target.x) / 2)
        .attr("y", (d: any) => (d.source.y + d.target.y) / 2 - 6);
      node.attr("transform", (d: any) => "translate(" + d.x + "," + d.y + ")");
    });
  }, [data.macroMapNodes, data.macroMapEdges, scrollToCard]);

  // ---------------------------------------------------------------------------
  // Toggle functions
  // ---------------------------------------------------------------------------
  const toggleHeatmap = useCallback((btn: HTMLElement) => {
    const hm = document.getElementById("heatmap-section");
    const cv = document.getElementById("cards-view");
    const mm = document.getElementById("macro-map-section");
    const mmBtn = document.querySelector(".macromap-btn") as HTMLElement | null;
    const isActive = btn.classList.contains("active");

    if (!isActive && mmBtn && mmBtn.classList.contains("active")) {
      mmBtn.classList.remove("active");
      mmBtn.textContent = "\u26a1 Macro Map";
      if (mm) mm.style.display = "none";
    }
    btn.classList.toggle("active", !isActive);
    btn.textContent = isActive ? "\u25a6 Heat Map" : "\u2715 Cards View";
    if (hm) hm.style.display = isActive ? "none" : "block";
    if (cv) cv.style.display = isActive ? "block" : "none";
    if (mm) mm.style.display = "none";
  }, []);

  const toggleMacroMap = useCallback(
    (btn: HTMLElement) => {
      const mm = document.getElementById("macro-map-section");
      const cv = document.getElementById("cards-view");
      const hm = document.getElementById("heatmap-section");
      const hmBtn = document.querySelector(".heatmap-btn") as HTMLElement | null;
      const isActive = btn.classList.contains("active");

      if (!isActive && hmBtn && hmBtn.classList.contains("active")) {
        hmBtn.classList.remove("active");
        hmBtn.textContent = "\u25a6 Heat Map";
        if (hm) hm.style.display = "none";
      }
      btn.classList.toggle("active", !isActive);
      btn.textContent = isActive ? "\u26a1 Macro Map" : "\u2715 Cards View";
      if (mm) mm.style.display = isActive ? "none" : "block";
      if (cv) cv.style.display = isActive ? "block" : "none";
      if (hm) hm.style.display = "none";

      if (!isActive) setTimeout(renderMacroMap, 100);
    },
    [renderMacroMap],
  );

  const toggleSP = useCallback((header: HTMLElement) => {
    const panel = header.closest(".summary-panel") as HTMLElement | null;
    if (!panel) return;
    const body = panel.querySelector(".sp-body") as HTMLElement | null;
    const preview = panel.querySelector(".sp-preview") as HTMLElement | null;
    const toggle = header.querySelector(".sp-toggle") as HTMLElement | null;
    if (!body) return;
    body.classList.toggle("collapsed");
    const isCollapsed = body.classList.contains("collapsed");
    if (toggle) toggle.textContent = isCollapsed ? "\u25b6" : "\u25bc";
    if (preview) preview.style.display = isCollapsed ? "block" : "none";
  }, []);

  const toggleChanges = useCallback(() => {
    const body = document.getElementById("changes-body");
    const toggle = document.getElementById("changes-toggle");
    if (!body) return;
    body.classList.toggle("collapsed");
    if (toggle) toggle.textContent = body.classList.contains("collapsed") ? "\u25b6" : "\u25bc";
  }, []);

  const toggleEditMode = useCallback((btn: HTMLElement) => {
    document.body.classList.toggle("edit-mode");
    const isEdit = document.body.classList.contains("edit-mode");
    btn.textContent = isEdit ? "\u2713 Save Changes" : "\u270e Edit Mode";
    btn.classList.toggle("active", isEdit);
    document.querySelectorAll<HTMLElement>(".value").forEach((el) => {
      el.contentEditable = isEdit ? "true" : "false";
    });
    if (!isEdit) {
      const overrides: Record<string, string> = {};
      document.querySelectorAll<HTMLElement>(".card").forEach((card) => {
        const key = card.dataset.key;
        const valEl = card.querySelector(".value") as HTMLElement | null;
        if (key && valEl && valEl.textContent !== valEl.dataset.original) {
          overrides[key] = valEl.textContent || "";
        }
      });
      if (Object.keys(overrides).length > 0) {
        console.log("Manual overrides:", overrides);
        showToast(`${Object.keys(overrides).length} value(s) overridden in-browser.`);
      }
    }
  }, []);

  const showToast = useCallback((msg: string) => {
    const t = document.createElement("div");
    t.className = "toast-msg";
    t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add("show"));
    setTimeout(() => {
      t.classList.remove("show");
      setTimeout(() => t.remove(), 400);
    }, 4000);
  }, []);

  const reloadDashboard = useCallback(
    (btn: HTMLElement) => {
      btn.classList.add("spinning");
      btn.innerHTML = '<span class="reload-spinner"></span> Refreshing data...';
      fetch("/api/refresh", { method: "POST" })
        .then((r) => r.json())
        .then((d: any) => {
          if (d.status === "ok" || d.indicators) {
            location.reload();
          } else {
            throw new Error(d.message || "Refresh failed");
          }
        })
        .catch(() => {
          showToast("Refresh failed \u2014 showing cached data.");
          btn.innerHTML = '<span class="reload-icon">\u21bb</span> Reload';
          btn.classList.remove("spinning");
          setTimeout(() => location.reload(), 2000);
        });
    },
    [showToast],
  );

  const switchToCard = useCallback(
    (key: string) => {
      const btn = document.querySelector(".heatmap-btn") as HTMLElement | null;
      if (btn && btn.classList.contains("active")) {
        toggleHeatmap(btn);
      }
      setTimeout(() => scrollToCard(key), 200);
    },
    [toggleHeatmap, scrollToCard],
  );

  // ---------------------------------------------------------------------------
  // Glossary term wrapping
  // ---------------------------------------------------------------------------
  const wrapGlossaryTerms = useCallback(() => {
    const terms = Object.keys(data.termGlossary).sort((a, b) => b.length - a.length);
    document.querySelectorAll<HTMLElement>(".commentary").forEach((el) => {
      let html = el.innerHTML;
      terms.forEach((term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp("\\b(" + escaped + ")(?![^<]*>)", "gi");
        html = html.replace(regex, (match) => {
          return '<span class="glossary-term" data-tooltip="' + data.termGlossary[term] + '">' + match + "</span>";
        });
      });
      el.innerHTML = html;
    });
  }, [data.termGlossary]);

  // ---------------------------------------------------------------------------
  // Global event delegation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Period button
      const periodBtn = target.closest(".period-btn") as HTMLElement | null;
      if (periodBtn) {
        e.stopPropagation();
        const card = periodBtn.closest(".card") as HTMLElement | null;
        if (!card) return;
        const period = periodBtn.dataset.period || "3M";
        card.querySelectorAll<HTMLElement>(".period-btn").forEach((b) => b.classList.remove("active"));
        periodBtn.classList.add("active");
        renderChart(card, period);
        return;
      }

      // Related chip -> scrollToCard
      const relatedChip = target.closest('[data-action="scrollToCard"]') as HTMLElement | null;
      if (relatedChip) {
        e.stopPropagation();
        const tgt = relatedChip.dataset.target;
        if (tgt) scrollToCard(tgt);
        return;
      }

      // Heatmap cell -> switchToCard
      const hmCell = target.closest('[data-action="switchToCard"]') as HTMLElement | null;
      if (hmCell) {
        e.stopPropagation();
        const key = hmCell.dataset.key;
        if (key) switchToCard(key);
        return;
      }

      // Summary panel header -> toggleSP
      const spHeader = target.closest(".sp-header") as HTMLElement | null;
      if (spHeader) {
        toggleSP(spHeader);
        return;
      }

      // Changes inline header -> toggleChanges
      const changesHeader = target.closest('[data-action="toggleChanges"]') as HTMLElement | null;
      if (changesHeader) {
        toggleChanges();
        return;
      }

      // Heatmap button
      const heatmapBtn = target.closest(".heatmap-btn") as HTMLElement | null;
      if (heatmapBtn) {
        toggleHeatmap(heatmapBtn);
        return;
      }

      // Macromap button
      const macromapBtn = target.closest(".macromap-btn") as HTMLElement | null;
      if (macromapBtn) {
        toggleMacroMap(macromapBtn);
        return;
      }

      // Reload button
      const reloadBtn = target.closest(".reload-btn") as HTMLElement | null;
      if (reloadBtn) {
        reloadDashboard(reloadBtn);
        return;
      }

      // Edit mode button
      const editBtn = target.closest(".edit-btn") as HTMLElement | null;
      if (editBtn) {
        toggleEditMode(editBtn);
        return;
      }

      // Card click -> toggleChart
      const card = target.closest(".card") as HTMLElement | null;
      if (card) {
        toggleChart(card);
        return;
      }
    };

    document.addEventListener("click", handleClick);

    // Keyboard shortcut: Ctrl/Cmd+E for edit mode
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        const editBtn = document.querySelector(".edit-btn") as HTMLElement | null;
        if (editBtn) toggleEditMode(editBtn);
      }
    };
    document.addEventListener("keydown", handleKeydown);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("keydown", handleKeydown);
    };
  }, [
    renderChart, scrollToCard, switchToCard, toggleChart, toggleSP,
    toggleChanges, toggleHeatmap, toggleMacroMap, reloadDashboard,
    toggleEditMode,
  ]);

  // ---------------------------------------------------------------------------
  // On mount: wrap glossary terms
  // ---------------------------------------------------------------------------
  useEffect(() => {
    wrapGlossaryTerms();
  }, [wrapGlossaryTerms]);

  // ---------------------------------------------------------------------------
  // Forward Look items
  // ---------------------------------------------------------------------------
  let flItemsHtml = "";
  if (data.forward_look && data.forward_look.length > 0) {
    for (const fl of data.forward_look) {
      let flImpactsHtml = "";
      for (const [fname, farrow, fcolor] of fl.impacts) {
        flImpactsHtml += `<span class="fl-impact" style="color:${fcolor}">${fname} ${farrow}</span>`;
      }
      flItemsHtml +=
        `<div class="fl-scenario">` +
        `<div class="fl-sc-head">` +
        `<span class="fl-sc-title">${fl.title}</span>` +
        `<span class="fl-sc-prob" style="color:${fl.prob_color}">${fl.probability}</span>` +
        `</div>` +
        `<p class="fl-sc-text">${fl.text}</p>` +
        `<div class="fl-sc-impacts">${flImpactsHtml}</div>` +
        `</div>`;
    }
  }
  if (!flItemsHtml) {
    flItemsHtml = '<p style="color:var(--muted);font-size:0.78rem;">No scenarios triggered by current conditions.</p>';
  }

  const weeklyPreview = firstSentence(data.weekly_wrap);
  const flPreview = data.forward_look && data.forward_look.length > 0
    ? data.forward_look[0].title
    : "No scenarios triggered";

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"
        strategy="afterInteractive"
        onLoad={() => { d3LoadedRef.current = true; }}
      />
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"
        strategy="afterInteractive"
        onLoad={() => { chartJsLoadedRef.current = true; }}
      />

      <header className="topbar">
        <div className="topbar-left">
          <span className="logo">{"\u26a1"} MACRO PULSE</span>
          <span className="regime-badge" style={{ color: data.regimeColor }}>
            {data.regimeLabel}
          </span>
          <div className="signal-summary">
            <span className="sig-count bull">{"\u25b2"} {data.counts.BULLISH} BULLISH</span>
            <span className="sig-count bear">{"\u25bc"} {data.counts.BEARISH} BEARISH</span>
            <span className="sig-count neut">{"\u25ac"} {data.counts.NEUTRAL} NEUTRAL</span>
          </div>
          <span className="topbar-sep"></span>
          <div className="view-toggles">
            <span className="view-label">View:</span>
            <button className="heatmap-btn">{"\u25a6"} Heat Map</button>
            <button className="macromap-btn">{"\u26a1"} Macro Map</button>
          </div>
        </div>
        <div className="topbar-stats">
          <div className="stat">
            <span className="stat-label">VIX</span>
            <span
              className="stat-val"
              style={{ color: data.vixVal != null && data.vixVal > 20 ? "var(--bearish)" : "var(--bullish)" }}
            >
              {data.vixStr}
            </span>
          </div>
          <div className="stat">
            <span className="stat-label">WTI Oil</span>
            <span className="stat-val">{data.oilStr}</span>
          </div>
          <div className="stat">
            <span className="stat-label">S&amp;P 500</span>
            <span className="stat-val">{data.spStr}</span>
          </div>
        </div>
        <div className="topbar-right">
          <span className="timestamp">Data as of: {data.timestamp}</span>
          <span className="topbar-sep"></span>
          <button className="reload-btn">
            <span className="reload-icon">{"\u21bb"}</span> Reload
          </button>
          <button className="edit-btn">{"\u270e"} Edit Mode</button>
        </div>
      </header>

      <main className="main" ref={mainRef}>
        {/* Summary Panels */}
        <div className="summary-row">
          <div className="summary-panel sp-daily">
            <div className="sp-header">
              <span>{"\ud83d\udccb"} Daily Brief</span>
              <span className="sp-toggle">{"\u25bc"}</span>
            </div>
            <div className="sp-body">
              <p className="narrative-text">{data.narrative}</p>
              <p className="daily-brief-text">{data.daily_brief}</p>
              {data.changesHtml && (
                <div dangerouslySetInnerHTML={{ __html: data.changesHtml }} />
              )}
            </div>
          </div>
          <div className="summary-panel sp-weekly">
            <div className="sp-header">
              <span>{"\ud83d\udcca"} Weekly Wrap</span>
              <span className="sp-toggle">{"\u25b6"}</span>
            </div>
            <div className="sp-preview">{weeklyPreview}...</div>
            <div className="sp-body collapsed">{data.weekly_wrap}</div>
          </div>
          <div className="summary-panel sp-forward">
            <div className="sp-header">
              <span>{"\ud83d\udd2e"} Forward Look</span>
              <span className="sp-toggle">{"\u25b6"}</span>
            </div>
            <div className="sp-preview">{flPreview}...</div>
            <div
              className="sp-body collapsed"
              dangerouslySetInnerHTML={{ __html: flItemsHtml }}
            />
          </div>
        </div>

        {/* Heatmap section (hidden by default) */}
        <section className="heatmap-section" id="heatmap-section" style={{ display: "none" }}>
          <h2 className="section-title">{"\ud83d\udd25"} Heat Map</h2>
          <div
            className="heatmap-grid"
            dangerouslySetInnerHTML={{ __html: data.heatmapCellsHtml }}
          />
          <div className="hm-legend">
            <span style={{ color: "#ff1a1a" }}>{"\u25a0"} Strong Bear</span>
            <span style={{ color: "#ff4d4d" }}>{"\u25a0"} Bearish</span>
            <span style={{ color: "#3d4663" }}>{"\u25a0"} Neutral</span>
            <span style={{ color: "#00c853" }}>{"\u25a0"} Bullish</span>
            <span style={{ color: "#00ff88" }}>{"\u25a0"} Strong Bull</span>
          </div>
        </section>

        {/* Macro Map section (hidden by default) */}
        <section className="macro-map-section" id="macro-map-section" style={{ display: "none" }}>
          <h2 className="section-title">{"\u26a1"} Macro Map — Indicator Network</h2>
          <div id="macro-map-container"></div>
        </section>

        {/* Cards View */}
        <div id="cards-view">
          <div dangerouslySetInnerHTML={{ __html: data.sectionsHtml }} />
          <div dangerouslySetInnerHTML={{ __html: data.upcomingHtml }} />
        </div>

        {/* Timeline */}
        <div dangerouslySetInnerHTML={{ __html: data.timelineHtml }} />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <span className="footer-brand">Macro Pulse v3.0 &mdash; Built for David</span>
          <span className="footer-meta">
            Data: FRED, Yahoo Finance &nbsp;|&nbsp; Last refresh: {data.timestamp}
          </span>
          <span className="footer-cmd">
            {"\u21bb"} Refresh: <code>POST /api/refresh</code>
          </span>
        </div>
      </footer>
    </>
  );
}
