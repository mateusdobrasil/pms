"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import "./how-it-works.css";

// "Como funciona" da página inicial: animação em desenho (SVG + CSS), sem vídeo.
// Os textos ficam fora do desenho (HTML), para ficarem legíveis no celular e sempre corretos.

const SCENE_MS = 5000;

const NAVY = "#0a2e82";
const NAVY_DARK = "#04163f";
const CORAL = "#ff6a4b";
const ORANGE = "#fe8c2b";
const LIGHT = "#eef3fc";
const SOFT = "#dce5f8";
const LINE = "#b9caf0";
const GREEN = "#16a34a";

const STEPS = [
  {
    title: "Sua loja, com a sua marca",
    text: "Montamos a loja com o seu logo e as suas cores, pronta para vender: num endereço nosso (sualoja.minhaloja.promo) ou no seu domínio.",
  },
  { title: "O cliente escolhe e compra", text: "Produtos com fotos, tamanhos e estoque. Compra sem cadastro, direto pelo celular." },
  { title: "Paga com Pix ou cartão", text: "Pagamento pelo Mercado Pago, confirmado na hora e com o dinheiro direto na sua conta." },
  { title: "O pedido cai no seu painel", text: "Você vê o pedido pago, os dados do cliente e o resumo de vendas do dia e do mês." },
  { title: "Você envia, o cliente acompanha", text: "Frete calculado pelo CEP, código de rastreio e e-mail automático para o cliente." },
];

const d = (s: number): CSSProperties => ({ animationDelay: `${s}s` });

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [started, setStarted] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  // Só começa quando a animação aparece na tela (senão a primeira cena roda sem ninguém ver).
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!started || !playing) return;
    const timer = setTimeout(() => setActive((a) => (a + 1) % STEPS.length), SCENE_MS);
    return () => clearTimeout(timer);
  }, [active, playing, started]);

  const Scene = SCENES[active];

  return (
    <div className="grid items-center gap-8 md:grid-cols-[1.25fr_1fr]">
      <div ref={stageRef} className="relative overflow-hidden rounded-2xl border border-primary-100 bg-primary-50 shadow-sm">
        <svg viewBox="0 0 640 400" className="hiw-stage block h-auto w-full" role="img" aria-label={STEPS[active].title}>
          <defs>
            <filter id="hiw-shadow" x="-50%" y="-50%" width="200%" height="200%">
              <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor={NAVY_DARK} floodOpacity="0.16" />
            </filter>
          </defs>
          <Backdrop />
          {started ? <Scene key={active} /> : <Scene1 still />}
        </svg>
        <div className="absolute inset-x-0 bottom-0 h-1 bg-primary-100">
          {started && (
            <div
              key={`${active}-${playing}`}
              className="hiw-progress h-full bg-accent-500"
              style={{ animationDuration: `${SCENE_MS}ms`, animationPlayState: playing ? "running" : "paused" }}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setStarted(true);
            setPlaying((p) => !p);
          }}
          aria-label={playing ? "Pausar animação" : "Continuar animação"}
          className="absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-white/90 text-primary-700 shadow-sm ring-1 ring-primary-100 transition hover:bg-white"
        >
          {playing ? (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
          )}
        </button>
      </div>

      <ol className="space-y-2">
        {STEPS.map((step, i) => {
          const isActive = i === active;
          return (
            <li key={step.title}>
              <button
                type="button"
                onClick={() => {
                  setStarted(true);
                  setActive(i);
                }}
                aria-current={isActive ? "step" : undefined}
                className={`flex w-full gap-4 rounded-xl px-4 py-3 text-left transition ${
                  isActive ? "bg-white shadow-sm ring-1 ring-primary-100" : "hover:bg-white/60"
                }`}
              >
                <span
                  className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                    isActive ? "bg-accent-500 text-white" : "bg-primary-100 text-primary-700"
                  }`}
                >
                  {i + 1}
                </span>
                <span>
                  <span className={`block font-semibold ${isActive ? "text-neutral-900" : "text-neutral-600"}`}>
                    {step.title}
                  </span>
                  {isActive && <span className="mt-1 block text-sm leading-relaxed text-neutral-600">{step.text}</span>}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Backdrop() {
  return (
    <g aria-hidden="true">
      <rect width="640" height="400" fill={LIGHT} />
      <circle cx="90" cy="70" r="110" fill={SOFT} opacity="0.6" />
      <circle cx="580" cy="350" r="140" fill={SOFT} opacity="0.6" />
      <circle cx="560" cy="60" r="36" fill={ORANGE} opacity="0.12" />
    </g>
  );
}

function Phone({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g filter="url(#hiw-shadow)">
        <rect width="150" height="290" rx="24" fill={NAVY_DARK} />
        <rect x="7" y="7" width="136" height="276" rx="18" fill="#fff" />
      </g>
      <rect x="55" y="12" width="40" height="6" rx="3" fill={NAVY_DARK} />
      {children}
    </g>
  );
}

function Sparkle({ x, y, size = 10, color = ORANGE, delay = 0 }: { x: number; y: number; size?: number; color?: string; delay?: number }) {
  const s = size;
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="hiw-pop" style={d(delay)}>
        <path
          className="hiw-float"
          d={`M0 ${-s} Q${s * 0.15} ${-s * 0.15} ${s} 0 Q${s * 0.15} ${s * 0.15} 0 ${s} Q${-s * 0.15} ${s * 0.15} ${-s} 0 Q${-s * 0.15} ${-s * 0.15} 0 ${-s}Z`}
          fill={color}
        />
      </g>
    </g>
  );
}

/* 1. Loja com a marca do lojista */
function Scene1({ still = false }: { still?: boolean }) {
  const anim = (cls: string) => (still ? undefined : cls);
  const cards = [
    { x: 15, y: 64, c: ORANGE },
    { x: 79, y: 64, c: "#2d55c0" },
    { x: 15, y: 150, c: CORAL },
    { x: 79, y: 150, c: "#8ea6e3" },
  ];
  return (
    <g>
      {/* Barra de endereço: começa no endereço da plataforma e troca para o domínio próprio */}
      <g transform="translate(190 12)">
        <g className={anim("hiw-drop")}>
          <g filter="url(#hiw-shadow)">
            <rect width="260" height="32" rx="16" fill="#fff" />
          </g>
          <g transform="translate(22 16)">
            <rect x="-6" y="-2" width="12" height="9" rx="2" fill={GREEN} />
            <path d="M-3.5 -2 v-3 a3.5 3.5 0 0 1 7 0 v3" fill="none" stroke={GREEN} strokeWidth="2" />
          </g>
          <g className={anim("hiw-out")} style={d(2.8)}>
            <text x="140" y="21" textAnchor="middle" fontSize="13" fontWeight="600" fill={NAVY_DARK}>
              sualoja.<tspan fill={CORAL}>minhaloja.promo</tspan>
            </text>
          </g>
          {!still && (
            <g className="hiw-fade" style={d(3.1)}>
              <text x="140" y="21" textAnchor="middle" fontSize="13" fontWeight="600" fill={NAVY_DARK}>
                sualoja<tspan fill={CORAL}>.com.br</tspan>
              </text>
            </g>
          )}
        </g>
      </g>

      <Phone x={245} y={55}>
        <g className={anim("hiw-drop")} style={d(0.2)}>
          <rect x="7" y="22" width="136" height="32" fill={CORAL} />
          <circle cx="24" cy="38" r="8" fill="#fff" />
          <rect x="37" y="34" width="44" height="8" rx="4" fill="#fff" opacity="0.9" />
          <rect x="116" y="32" width="16" height="12" rx="3" fill="#fff" opacity="0.9" />
        </g>
        {cards.map((c, i) => (
          <g key={i} className={anim("hiw-pop")} style={d(0.5 + i * 0.2)}>
            <rect x={c.x} y={c.y} width="56" height="78" rx="8" fill={LIGHT} />
            <rect x={c.x + 6} y={c.y + 6} width="44" height="40" rx="5" fill={c.c} />
            <rect x={c.x + 6} y={c.y + 52} width="34" height="5" rx="2.5" fill={LINE} />
            <rect x={c.x + 6} y={c.y + 62} width="22" height="7" rx="3.5" fill={NAVY} />
          </g>
        ))}
        <g className={anim("hiw-pop")} style={d(1.4)}>
          <rect x="15" y="240" width="120" height="28" rx="9" fill={NAVY} />
          <rect x="50" y="251" width="50" height="6" rx="3" fill="#fff" opacity="0.85" />
        </g>
      </Phone>

      {/* Paleta: "as suas cores" */}
      <g transform="translate(110 120)">
        <g className={anim("hiw-pop")} style={d(1.7)}>
          <g filter="url(#hiw-shadow)">
            <rect width="92" height="120" rx="16" fill="#fff" />
          </g>
          <circle cx="30" cy="34" r="13" fill={CORAL} />
          <circle cx="62" cy="34" r="13" fill={NAVY} />
          <circle cx="30" cy="70" r="13" fill={ORANGE} />
          <circle cx="62" cy="70" r="13" fill={GREEN} />
          <rect x="18" y="96" width="56" height="8" rx="4" fill={SOFT} />
        </g>
      </g>

      {/* Selo do logo */}
      <g transform="translate(440 150)">
        <g className={anim("hiw-pop")} style={d(2.1)}>
          <g filter="url(#hiw-shadow)">
            <circle r="46" fill="#fff" />
          </g>
          <circle r="34" fill={CORAL} />
          <path d="M0 -18 L5.3 -6.5 L18 -5.6 L8.4 2.8 L11.2 15.2 L0 8.6 L-11.2 15.2 L-8.4 2.8 L-18 -5.6 L-5.3 -6.5Z" fill="#fff" />
        </g>
      </g>

      {!still && (
        <>
          <Sparkle x={420} y={80} delay={2.4} />
          <Sparkle x={505} y={230} size={7} color={CORAL} delay={2.6} />
          <Sparkle x={95} y={290} size={8} color={NAVY} delay={2.8} />
        </>
      )}
    </g>
  );
}

/* 2. Cliente escolhe o tamanho e põe no carrinho */
function Scene2() {
  return (
    <g>
      <Phone x={245} y={55}>
        {/* Topo com carrinho */}
        <rect x="16" y="30" width="40" height="8" rx="4" fill={SOFT} />
        <g transform="translate(125 34)">
          <g className="hiw-bump" style={d(2.35)}>
            <path d="M-9 -6 h3 l3 10 h10 l2 -7 h-14" fill="none" stroke={NAVY} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="-1" cy="7" r="1.6" fill={NAVY} />
            <circle cx="7" cy="7" r="1.6" fill={NAVY} />
          </g>
          <g className="hiw-pop" style={d(2.35)}>
            <circle cx="9" cy="-7" r="7" fill={CORAL} />
            <text x="9" y="-3.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">1</text>
          </g>
        </g>

        {/* Foto do produto */}
        <rect x="15" y="48" width="120" height="98" rx="10" fill="#ffe3d6" />
        <g className="hiw-pop" style={d(0.2)}>
          <path d="M55 74 l12 -6 h16 l12 6 l12 14 l-10 8 l-6 -6 v40 h-32 v-40 l-6 6 l-10 -8 z" fill={CORAL} />
        </g>
        <rect x="15" y="155" width="84" height="7" rx="3.5" fill={LINE} />
        <rect x="15" y="168" width="46" height="9" rx="4.5" fill={NAVY} />

        {/* Tamanhos */}
        {["P", "M", "G"].map((s, i) => (
          <g key={s}>
            <rect x={15 + i * 30} y="186" width="24" height="22" rx="6" fill="#fff" stroke={LINE} strokeWidth="1.5" />
            <text x={27 + i * 30} y="201" textAnchor="middle" fontSize="11" fontWeight="600" fill={NAVY_DARK}>{s}</text>
          </g>
        ))}
        <g className="hiw-pop" style={d(0.8)}>
          <rect x="45" y="186" width="24" height="22" rx="6" fill={NAVY} />
          <text x="57" y="201" textAnchor="middle" fontSize="11" fontWeight="600" fill="#fff">M</text>
        </g>

        {/* Botão comprar */}
        <rect x="15" y="225" width="120" height="30" rx="9" fill={CORAL} />
        <rect x="45" y="237" width="60" height="6" rx="3" fill="#fff" opacity="0.9" />
        <circle cx="75" cy="240" r="12" fill="#fff" className="hiw-tap" style={d(1.4)} />
        <g className="hiw-fly" style={d(1.6)}>
          <rect x="67" y="232" width="16" height="16" rx="3" fill={ORANGE} className="hiw-fade" style={d(1.6)} />
        </g>

        {/* Dedo do cliente */}
        <g className="hiw-pointer" style={d(0.9)}>
          <circle cx="86" cy="250" r="11" fill={NAVY} opacity="0.18" />
          <circle cx="86" cy="250" r="5" fill={NAVY} opacity="0.6" />
        </g>
      </Phone>

      {/* Etiquetas flutuando: estoque e variações */}
      <g transform="translate(120 150)">
        <g className="hiw-pop" style={d(0.5)}>
          <g filter="url(#hiw-shadow)"><rect width="96" height="46" rx="12" fill="#fff" /></g>
          <circle cx="22" cy="23" r="10" fill={GREEN} opacity="0.15" />
          <path d="M17 23 l4 4 l7 -8" fill="none" stroke={GREEN} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="40" y="16" width="44" height="6" rx="3" fill={LINE} />
          <rect x="40" y="27" width="30" height="6" rx="3" fill={SOFT} />
        </g>
      </g>
      <g transform="translate(430 210)">
        <g className="hiw-pop" style={d(2.6)}>
          <g filter="url(#hiw-shadow)"><rect width="90" height="56" rx="14" fill="#fff" /></g>
          <g transform="translate(28 28)">
            <path d="M-10 -7 h4 l4 13 h12 l3 -9 h-17" fill="none" stroke={CORAL} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="0" cy="10" r="2" fill={CORAL} />
            <circle cx="10" cy="10" r="2" fill={CORAL} />
          </g>
          <rect x="50" y="22" width="28" height="12" rx="6" fill={CORAL} opacity="0.2" />
        </g>
      </g>
      <Sparkle x={470} y={110} delay={2.8} />
    </g>
  );
}

// QR code de mentira, mas com cara de QR (gerado sempre igual).
const QR_CELLS = (() => {
  const cells: { x: number; y: number }[] = [];
  const finder = (i: number, j: number) => (i < 3 && j < 3) || (i > 7 && j < 3) || (i < 3 && j > 7);
  for (let i = 0; i < 11; i++)
    for (let j = 0; j < 11; j++) if (!finder(i, j) && (i * 7 + j * 13 + i * j) % 5 < 2) cells.push({ x: i, y: j });
  return cells;
})();

/* 3. Pagamento aprovado */
function Scene3() {
  const confetti = [
    { dx: "-70px", dy: "-60px", c: CORAL },
    { dx: "60px", dy: "-70px", c: ORANGE },
    { dx: "80px", dy: "10px", c: NAVY },
    { dx: "-80px", dy: "20px", c: ORANGE },
    { dx: "-40px", dy: "75px", c: GREEN },
    { dx: "45px", dy: "70px", c: CORAL },
  ];
  return (
    <g>
      <Phone x={245} y={55}>
        <rect x="16" y="30" width="56" height="8" rx="4" fill={SOFT} />
        <rect x="16" y="44" width="70" height="12" rx="6" fill={NAVY} />
        <g transform="translate(31 66)">
          <rect x="-4" y="-4" width="96" height="96" rx="8" fill="#fff" stroke={LINE} strokeWidth="1.5" />
          {[
            [0, 0],
            [64, 0],
            [0, 64],
          ].map(([x, y]) => (
            <g key={`${x}-${y}`}>
              <rect x={x} y={y} width="24" height="24" rx="3" fill={NAVY_DARK} />
              <rect x={x + 4} y={y + 4} width="16" height="16" rx="2" fill="#fff" />
              <rect x={x + 8} y={y + 8} width="8" height="8" rx="1" fill={NAVY_DARK} />
            </g>
          ))}
          {QR_CELLS.map((c) => (
            <rect key={`${c.x}-${c.y}`} x={c.x * 8} y={c.y * 8} width="7" height="7" rx="1" fill={NAVY_DARK} />
          ))}
          <rect x="-2" y="0" width="92" height="3" rx="1.5" fill={CORAL} className="hiw-scan" style={d(0.3)} />
        </g>
        <rect x="31" y="172" width="88" height="24" rx="7" fill="#fff" stroke={NAVY} strokeWidth="1.5" />
        <rect x="52" y="181" width="46" height="6" rx="3" fill={NAVY} opacity="0.7" />
        <rect x="31" y="206" width="88" height="6" rx="3" fill={SOFT} />
        <rect x="45" y="218" width="60" height="6" rx="3" fill={SOFT} />

        {/* Aprovado */}
        <rect x="7" y="22" width="136" height="261" rx="18" fill="#fff" className="hiw-fade" style={d(2.4)} />
        <g transform="translate(75 130)">
          {confetti.map((c, i) => (
            <circle
              key={i}
              r="4"
              fill={c.c}
              className="hiw-burst"
              style={{ ...d(2.9), "--dx": c.dx, "--dy": c.dy } as CSSProperties}
            />
          ))}
          <g className="hiw-pop" style={d(2.6)}>
            <circle r="36" fill={GREEN} />
          </g>
          <path d="M-15 0 l10 10 l20 -20" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" className="hiw-draw" style={d(2.95)} />
        </g>
        <g className="hiw-fade-up" style={d(3.1)}>
          <text x="75" y="198" textAnchor="middle" fontSize="18" fontWeight="700" fill={GREEN}>Pago!</text>
          <rect x="40" y="210" width="70" height="6" rx="3" fill={SOFT} />
        </g>
      </Phone>

      {/* Cartão de crédito */}
      <g transform="translate(95 150)">
        <g className="hiw-pop" style={d(0.4)}>
          <g className="hiw-float">
            <g filter="url(#hiw-shadow)"><rect width="120" height="76" rx="12" fill={NAVY} /></g>
            <rect x="14" y="18" width="22" height="16" rx="3" fill={ORANGE} />
            <rect x="14" y="46" width="70" height="7" rx="3.5" fill="#fff" opacity="0.6" />
            <rect x="14" y="58" width="40" height="6" rx="3" fill="#fff" opacity="0.35" />
            <circle cx="92" cy="58" r="9" fill={CORAL} opacity="0.9" />
            <circle cx="104" cy="58" r="9" fill={ORANGE} opacity="0.9" />
          </g>
        </g>
      </g>

      {/* Losango do Pix */}
      <g transform="translate(470 140)">
        <g className="hiw-pop" style={d(0.7)}>
          <g className="hiw-float" style={{ animationDelay: "-1.5s" }}>
            <g filter="url(#hiw-shadow)"><rect x="-32" y="-32" width="64" height="64" rx="16" fill="#fff" /></g>
            <rect x="-14" y="-14" width="28" height="28" rx="6" fill="#32bcad" transform="rotate(45)" />
            <rect x="-6" y="-6" width="12" height="12" rx="2" fill="#fff" transform="rotate(45)" />
          </g>
        </g>
      </g>
      <Sparkle x={455} y={270} size={8} color={GREEN} delay={3.2} />
    </g>
  );
}

/* 4. Pedido chegando no painel */
function Scene4() {
  const oldRows = [174, 198, 222];
  return (
    <g>
      {/* Notebook */}
      <g filter="url(#hiw-shadow)">
        <rect x="150" y="50" width="340" height="222" rx="14" fill={NAVY_DARK} />
        <path d="M120 272 h400 l-14 18 h-372 z" fill={LINE} />
      </g>
      <rect x="160" y="60" width="320" height="202" rx="6" fill="#fff" />
      <rect x="160" y="60" width="58" height="202" rx="6" fill={NAVY} />
      <rect x="212" y="60" width="6" height="202" fill={NAVY} />
      <circle cx="189" cy="82" r="9" fill={ORANGE} />
      {[108, 126, 144, 162].map((y, i) => (
        <rect key={y} x="172" y={y} width={i === 0 ? 34 : 28} height="6" rx="3" fill="#fff" opacity={i === 0 ? 0.95 : 0.45} />
      ))}

      <rect x="232" y="74" width="90" height="9" rx="4.5" fill={SOFT} />
      {/* Resumo de vendas */}
      <rect x="232" y="94" width="112" height="44" rx="8" fill={LIGHT} />
      <rect x="242" y="104" width="40" height="5" rx="2.5" fill={LINE} />
      <rect x="242" y="116" width="76" height="12" rx="4" fill={GREEN} className="hiw-grow" style={d(2.2)} />
      <rect x="354" y="94" width="112" height="44" rx="8" fill={LIGHT} />
      <rect x="364" y="104" width="40" height="5" rx="2.5" fill={LINE} />
      <rect x="364" y="116" width="56" height="12" rx="4" fill={NAVY} />

      {/* Pedidos: os antigos descem e o novo entra no topo */}
      {oldRows.map((y, i) => (
        <g key={y} className="hiw-push" style={d(1)}>
          <rect x="232" y={y} width="234" height="18" rx="5" fill={LIGHT} />
          <rect x="240" y={y + 6} width="40" height="6" rx="3" fill={LINE} />
          <rect x="296" y={y + 6} width="60" height="6" rx="3" fill={SOFT} />
          <rect x="418" y={y + 4} width="40" height="10" rx="5" fill={i === 0 ? "#bfdbfe" : SOFT} />
        </g>
      ))}
      <g className="hiw-slide-in" style={d(1)}>
        <rect x="232" y="150" width="234" height="18" rx="5" fill="#fff" stroke={ORANGE} strokeWidth="1.5" />
        <rect x="240" y="156" width="40" height="6" rx="3" fill={NAVY} />
        <rect x="296" y="156" width="60" height="6" rx="3" fill={LINE} />
        <rect x="418" y="154" width="40" height="10" rx="5" fill={GREEN} />
      </g>

      {/* Sino de notificação */}
      <g transform="translate(548 88)">
        <g className="hiw-pop" style={d(0.4)}>
          <g filter="url(#hiw-shadow)"><circle r="30" fill="#fff" /></g>
        </g>
        <g className="hiw-shake" style={d(1.1)}>
          <path d="M-12 6 h24 l-3 -4 v-8 a9 9 0 0 0 -18 0 v8 z" fill={NAVY} />
          <circle cy="10" r="3.5" fill={NAVY} />
        </g>
        <g className="hiw-pop" style={d(1.1)}>
          <circle cx="12" cy="-14" r="7" fill={CORAL} />
        </g>
      </g>

      {/* Dinheiro entrando na carteira */}
      <g transform="translate(40 210)">
        {[0, 1, 2].map((i) => (
          <g key={i} className="hiw-coin" style={d(1.8 + i * 0.35)}>
            <circle cx={40 + (i - 1) * 6} cy="12" r="12" fill={ORANGE} stroke="#e8502f" strokeWidth="2" />
            <text x={40 + (i - 1) * 6} y="16" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">R$</text>
          </g>
        ))}
        <g className="hiw-pop" style={d(0.6)}>
          <g filter="url(#hiw-shadow)"><rect x="0" y="22" width="80" height="56" rx="12" fill={CORAL} /></g>
          <rect x="44" y="40" width="40" height="22" rx="8" fill="#e8502f" />
          <circle cx="58" cy="51" r="4" fill="#fff" />
        </g>
      </g>
      <Sparkle x={560} y={200} delay={2.8} />
      <Sparkle x={100} y={150} size={7} color={CORAL} delay={3} />
    </g>
  );
}

/* 5. Envio e rastreio */
function Scene5() {
  return (
    <g>
      {/* Estrada */}
      <rect x="20" y="304" width="440" height="10" rx="5" fill={LINE} />
      <line x1="30" y1="309" x2="450" y2="309" stroke="#fff" strokeWidth="2" strokeDasharray="14 12" />

      {/* Caixa embalada que "entra" no caminhão */}
      <g transform="translate(70 220)">
        <g className="hiw-pop" style={d(0.2)}>
          <g className="hiw-out" style={d(1.6)}>
            <rect width="78" height="62" rx="6" fill="#d9a066" />
            <path d="M0 18 h78" stroke="#b9824a" strokeWidth="2" />
            <rect x="31" y="0" width="16" height="62" fill="#f3d3a7" className="hiw-fade" style={d(0.6)} />
            <g className="hiw-pop" style={d(1)}>
              <rect x="8" y="28" width="22" height="24" rx="3" fill="#fff" />
              <rect x="12" y="34" width="14" height="3" rx="1.5" fill={LINE} />
              <rect x="12" y="41" width="10" height="3" rx="1.5" fill={LINE} />
            </g>
          </g>
        </g>
      </g>

      {/* Caminhão */}
      <g className="hiw-truck" style={d(1.4)}>
        <g filter="url(#hiw-shadow)">
          <rect x="230" y="226" width="120" height="70" rx="8" fill={NAVY} />
          <path d="M350 246 h30 l22 24 v26 h-52 z" fill={CORAL} />
        </g>
        <rect x="230" y="262" width="120" height="8" fill={ORANGE} />
        <path d="M360 252 h16 l14 16 h-30 z" fill="#fff" opacity="0.85" />
        {[262, 320, 384].map((x) => (
          <g key={x}>
            <circle cx={x} cy="300" r="13" fill={NAVY_DARK} />
            <circle cx={x} cy="300" r="5" fill={LINE} />
          </g>
        ))}
      </g>

      {/* Celular do cliente com o rastreio */}
      <g transform="translate(484 64)">
        <g className="hiw-pop" style={d(0.6)}>
          <g filter="url(#hiw-shadow)">
            <rect width="116" height="220" rx="20" fill={NAVY_DARK} />
            <rect x="6" y="6" width="104" height="208" rx="15" fill="#fff" />
          </g>
          <rect x="20" y="24" width="50" height="8" rx="4" fill={SOFT} />
          <line x1="30" y1="62" x2="30" y2="172" stroke={SOFT} strokeWidth="4" strokeLinecap="round" />
          <line
            x1="30"
            y1="62"
            x2="30"
            y2="172"
            stroke={GREEN}
            strokeWidth="4"
            strokeLinecap="round"
            pathLength={100}
            className="hiw-line"
            style={d(2.2)}
          />
          {[62, 117, 172].map((y, i) => (
            <g key={y}>
              <circle cx="30" cy={y} r="9" fill="#fff" stroke={SOFT} strokeWidth="3" />
              <g className="hiw-pop" style={d(2.1 + i * 0.6)}>
                <circle cx="30" cy={y} r="9" fill={GREEN} />
                <path d={`M26 ${y} l3 3 l5 -6`} fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </g>
              <rect x="46" y={y - 7} width={i === 1 ? 40 : 50} height="6" rx="3" fill={LINE} />
              <rect x="46" y={y + 3} width="30" height="5" rx="2.5" fill={SOFT} />
            </g>
          ))}
        </g>
      </g>

      {/* E-mail para o cliente */}
      <g transform="translate(410 96)">
        <g className="hiw-pop" style={d(3.4)}>
          <g className="hiw-float">
            <g filter="url(#hiw-shadow)"><rect x="-30" y="-21" width="60" height="42" rx="8" fill="#fff" /></g>
            <path d="M-22 -12 l22 16 l22 -16" fill="none" stroke={CORAL} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="26" cy="-18" r="7" fill={GREEN} />
          </g>
        </g>
      </g>
      <Sparkle x={120} y={120} delay={2.6} />
      <Sparkle x={300} y={150} size={7} color={CORAL} delay={3.6} />
    </g>
  );
}

const SCENES = [() => <Scene1 />, Scene2, Scene3, Scene4, Scene5];
