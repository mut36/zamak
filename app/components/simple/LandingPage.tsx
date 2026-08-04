'use client';

import { useEffect, useState } from 'react';
import { COPY } from '../../i18n/simpleCopy';
import { useScrollReveal } from '../../hooks/useScrollReveal';
import { BrandMark } from '../BrandMark';
import { SiteFooter } from '../SiteFooter';

interface Props {
  onSignIn: () => void;
  error: string;
  configured: boolean;
}

const L = COPY.landing;
const PLANS = COPY.plans;

/** 히어로 데모 순환 주기 / 번역문이 뜨기 전 대기 시간 (핸드오프 명세값). */
const HERO_CYCLE_MS = 3800;
const HERO_WAIT_MS = 500;

/**
 * 한 섹션 안의 블록들이 동시에 튀어나오지 않도록 주는 간격. `.reveal`의
 * transition-delay로 들어간다(globals.css의 "Transition-delay on the element
 * creates card stagger"). 모션 최소화 설정에서는 `.reveal`의 transition 자체가
 * 꺼지므로 이 값도 함께 무력화된다.
 */
const REVEAL_STEP_MS = 60;
const revealDelay = (order: number) => ({
  transitionDelay: `${order * REVEAL_STEP_MS}ms`,
});

const TAG_CLASS: Record<string, string> = {
  red: 'lp-tag-red',
  orange: 'lp-tag-orange',
  green: 'lp-tag-green',
  neutral: 'lp-tag-neutral',
};

/**
 * CTA 4개(nav / 히어로 / 속도 / 최종)는 전부 같은 가입 진입점이다. 유입 위치는
 * `data-cta`로만 구분해 둔다 — 애널리틱스가 붙으면 이 속성을 이벤트
 * 파라미터로 쓰면 된다(핸드오프 "Interactions & Behavior").
 */
function Cta({
  location,
  className,
  style,
  onSignIn,
  configured,
}: {
  location: string;
  className: string;
  style?: React.CSSProperties;
  onSignIn: () => void;
  configured: boolean;
}) {
  return (
    <button
      type='button'
      data-cta={location}
      disabled={!configured}
      onClick={onSignIn}
      className={className}
      style={style}
    >
      {L.cta}
    </button>
  );
}

/** 세그먼트 컨트롤 — 비교 섹션과 CPS 섹션이 공유. 좌우 화살표로 이동한다. */
function Segmented({
  label,
  options,
  value,
  onChange,
  idPrefix,
  onCanvas,
  className = '',
}: {
  label: string;
  options: readonly string[];
  value: number;
  onChange: (i: number) => void;
  idPrefix: string;
  onCanvas?: boolean;
  className?: string;
}) {
  return (
    <div
      role='tablist'
      aria-label={label}
      className={`lp-seg${onCanvas ? ' lp-seg-canvas' : ''} ${className}`}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        e.preventDefault();
        const next =
          e.key === 'ArrowRight'
            ? (value + 1) % options.length
            : (value - 1 + options.length) % options.length;
        onChange(next);
        document.getElementById(`${idPrefix}-tab-${next}`)?.focus();
      }}
    >
      {options.map((opt, i) => (
        <button
          key={opt}
          type='button'
          role='tab'
          id={`${idPrefix}-tab-${i}`}
          aria-selected={value === i}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={value === i ? 0 : -1}
          onClick={() => onChange(i)}
          className='lp-seg-btn'
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

export function LandingPage({ onSignIn, error, configured }: Props) {
  // 히어로 데모: 4개 대사를 순환하며, 전환 시 옐로 커서로 500ms 대기했다가
  // 번역문이 뜬다. prefers-reduced-motion이면 타이머를 아예 시작하지 않는다.
  const [heroIdx, setHeroIdx] = useState(0);
  const [heroWaiting, setHeroWaiting] = useState(false);
  const [engine, setEngine] = useState(2); // 초기값 ZAMAK
  const [profile, setProfile] = useState(0); // 초기값 영화 · 드라마

  // 히어로 아래 섹션들은 스크롤로 도달할 때 올라온다. 히어로는 진입 즉시
  // 보여야 하므로 `.reveal`이 아니라 `animate-zrise`를 그대로 쓴다.
  const revealRoot = useScrollReveal<HTMLDivElement>();

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    const cycle = setInterval(() => {
      // 백그라운드 탭에서는 순환을 멈춘다 — 돌아왔을 때 몇 바퀴 앞선 상태로
      // 점프하지 않게.
      if (document.hidden) return;
      setHeroIdx((i) => (i + 1) % L.hero.pairs.length);
      setHeroWaiting(true);
      waitTimer = setTimeout(() => setHeroWaiting(false), HERO_WAIT_MS);
    }, HERO_CYCLE_MS);

    return () => {
      clearInterval(cycle);
      clearTimeout(waitTimer);
    };
  }, []);

  const pair = L.hero.pairs[heroIdx]!;
  const eng = L.compare.engines[engine]!;
  const cps = L.cps.profiles[profile]!;

  return (
    <div ref={revealRoot} className='w-full'>
      {/* ── 1. Sticky nav ─────────────────────────────────────── */}
      <nav className='lp-nav glass-nav backdrop-blur-[20px] backdrop-saturate-[180%]'>
        <BrandMark size={28} />

        <div className='flex items-center gap-1.5'>
          {/* 640px 아래에서는 링크를 숨기고 로고+CTA만 남긴다 (핸드오프 "모바일
              보완 필요"). Tailwind 유틸리티로 처리 — 컴포넌트 레이어의 미디어
              쿼리는 같은 요소의 `flex` 유틸리티에 밀린다. */}
          <div className='hidden sm:flex items-center gap-1.5'>
            <a href='#how' className='lp-navlink'>
              {L.nav.how}
            </a>
            <a href='#compare' className='lp-navlink'>
              {L.nav.compare}
            </a>
            <a href='#speed' className='lp-navlink'>
              {L.nav.speed}
            </a>
            <a href='#cps' className='lp-navlink'>
              {L.nav.cps}
            </a>
            <span className='lp-navsep' aria-hidden />
          </div>
          <Cta
            location='nav'
            onSignIn={onSignIn}
            configured={configured}
            className='lp-btn lp-btn-ink text-[13px] px-4 py-2 rounded-[10px]'
          />
        </div>
      </nav>

      <main>
        {/* ── 2. Hero ───────────────────────────────────────────── */}
        <header className='animate-zrise flex flex-col items-center text-center px-6 pt-[clamp(56px,9vh,88px)] pb-[90px]'>
          {/* 카피의 `\n`은 데스크톱 폭에 맞춰 손으로 넣은 것이라, 좁은
              화면에서는 그 줄이 다시 접히며 '배운' 같은 한 단어짜리 고아
              줄을 만든다. 640px 아래에서는 `\n`을 공백으로 풀고
              `text-balance`에 줄 나누기를 맡긴다 — 자막 예시(`.lp-hero-*`,
              `.lp-line`)는 줄 나눔 자체가 내용이므로 여기서 제외다. */}
          <h1 className='lp-h1 mb-[18px] whitespace-normal sm:whitespace-pre-line'>
            {L.hero.title}
          </h1>
          <p className='lp-hero-sub mb-[34px] max-w-full break-keep whitespace-normal sm:whitespace-pre-line'>
            {L.hero.sub.split('*').map((part, i) =>
              i % 2 === 1 ? (
                <span
                  key={i}
                  style={{
                    color: 'var(--ink-strong)',
                    fontWeight: 600,
                    background: 'linear-gradient(180deg, transparent 55%, var(--accent-soft) 55%)',
                  }}
                >
                  {part}
                </span>
              ) : (
                part
              )
            )}
          </p>

          <div className='flex flex-wrap items-center justify-center gap-3'>
            <Cta
              location='hero'
              onSignIn={onSignIn}
              configured={configured}
              className='lp-btn lp-btn-ink text-[16px] px-[30px] py-[14px]'
            />
            <a
              href='#compare'
              className='lp-btn-quiet text-[16px] px-[22px] py-[14px]'
            >
              {L.hero.secondaryCta}
            </a>
          </div>

          {!configured && (
            <p className='mt-4 text-[12.5px] text-quaternary'>
              {L.notConfigured}
            </p>
          )}
          {error && <p className='mt-4 text-sm text-danger'>{error}</p>}

          {/* 자막 데모 카드 */}
          <div
            className='lp-hero-card mt-16'
            role='img'
            aria-label={L.hero.demoLabel}
          >
            <div className='lp-hero-head'>
              <span className='lp-mono-tc'>{pair.tc}</span>
              <span className='lp-mono-lang'>{pair.lang} → KO</span>
            </div>
            {/* 대사 4개를 한 그리드 칸에 겹쳐 쌓는다 — 카드 높이가 늘 '가장
                긴 대사' 기준으로 고정되어, 3.8초마다 순환해도 아래 섹션이
                밀리지 않는다. 쉬는 대사는 `display:none`이 아니라
                `visibility:hidden`이라 자리를 계속 차지한다: 그게 이 구조의
                전부이고, 대사를 하나 더 넣어도 높이는 알아서 맞는다.
                (모바일 375px에서 210↔299px, 3.8초마다 89px씩 페이지 전체가
                뛰던 버그 — `decisions.md` §1-20.)

                대기 커서도 ko를 치우고 들어서는 게 아니라 같은 칸에
                겹친다. 치우면 활성 대사가 가장 긴 대사일 때 500ms 동안
                카드가 주저앉는다. */}
            {/* 좁은 화면에서 좌우 40px는 본문 폭을 232px까지 깎아 2줄짜리
                자막을 3줄로 접는다 — 자막 예시에서 줄 수는 곧 내용이므로
                패딩부터 양보한다. (Tailwind 유틸리티가 컴포넌트 레이어를
                이기므로 미디어 쿼리가 아니라 여기 있어야 한다.) */}
            <div className='lp-hero-body px-5 sm:px-10 pt-8 sm:pt-11 pb-8 sm:pb-10'>
              {L.hero.pairs.map((p, i) => {
                const on = i === heroIdx;
                return (
                  <div
                    key={p.tc}
                    className={`lp-hero-pair${on ? ' is-on' : ''}${on && heroWaiting ? ' is-waiting' : ''}`}
                    aria-hidden={!on}
                  >
                    <div className='lp-hero-src whitespace-pre-line break-keep'>
                      {p.src}
                    </div>
                    <div className='lp-hero-ko-slot'>
                      <span className='lp-hero-ko whitespace-pre-line break-keep'>
                        {p.ko}
                      </span>
                      <span className='lp-hero-wait' aria-hidden>
                        <span className='animate-zblink'>▋</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className='lp-hero-track'>
              <div
                className='lp-hero-fill'
                style={{ width: `${(heroIdx + 1) * 25}%` }}
              />
            </div>
          </div>
          <p className='mt-4 text-[12.5px] text-quaternary break-keep text-pretty'>
            {L.hero.note}
          </p>
        </header>

        {/* ── 3. 이용 방법 ──────────────────────────────────────── */}
        {/* "속도" 섹션(아래)이 "15초 동안 시스템이 하는 일"을 보여준다면,
            여기는 "화면에서 사용자가 실제로 누르는 4단계"를 보여준다 —
            같은 파이프라인을 다른 관점에서 두 번 판다. */}
        <section
          id='how'
          className='lp-anchor bg-bg px-6 py-24'
        >
          <div className='max-w-[880px] mx-auto'>
            <h2 className='lp-h2 text-center mb-2.5 reveal'>{L.how.title}</h2>
            <p
              className='lp-section-sub text-center max-w-[480px] mx-auto mb-10 break-keep reveal'
              style={revealDelay(1)}
            >
              {L.how.sub}
            </p>

            <div className='lp-how-grid reveal' style={revealDelay(2)}>
              {L.how.steps.map((step) => (
                <div key={step.num} className='lp-how-card'>
                  <span className='lp-how-num' aria-hidden>
                    {step.num}
                  </span>
                  <div className='lp-how-title'>{step.title}</div>
                  <p className='lp-how-desc break-keep whitespace-normal sm:whitespace-pre-line'>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 4. 번역 비교 ──────────────────────────────────────── */}
        <section
          id='compare'
          className='lp-anchor bg-surface border-t border-border-subtle px-6 py-[90px]'
        >
          <div className='max-w-[880px] mx-auto'>
            <h2 className='lp-h2 text-center mb-2.5 reveal'>{L.compare.title}</h2>
            <p
              className='lp-section-sub text-center max-w-[480px] mx-auto mb-10 break-keep reveal'
              style={revealDelay(1)}
            >
              {L.compare.sub}
            </p>

            <div className='flex justify-center mb-7 reveal' style={revealDelay(2)}>
              <Segmented
                label={L.compare.tablistLabel}
                idPrefix='engine'
                options={L.compare.engines.map((e) => e.name)}
                value={engine}
                onChange={setEngine}
              />
            </div>

            {/* `.reveal`은 카드가 아니라 그리드에 건다 — `.lp-card-result`는
                자체 `transition: all 0.3s`를 갖고 있어 리빌 transition과
                충돌한다(레이어 밖 `.reveal`이 이겨서 탭 전환이 느려진다). */}
            <div
              className='grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-[18px] items-stretch reveal'
              style={revealDelay(3)}
            >
              <div className='lp-card-source'>
                <span className='lp-card-label'>{L.compare.sourceLabel}</span>
                <p className='lp-line whitespace-pre-line break-keep'>
                  {L.compare.sourceLine}
                </p>
                <span className='mono text-[11px] text-quaternary'>
                  {L.compare.sourceMeta}
                </span>
              </div>

              <div
                id='engine-panel'
                role='tabpanel'
                aria-live='polite'
                aria-labelledby={`engine-tab-${engine}`}
                className={`lp-card-result${engine === 2 ? ' win' : ''}`}
              >
                <span className='lp-card-label'>
                  {L.compare.resultLabel(eng.name)}
                </span>
                <p
                  key={`e${engine}`}
                  className='lp-line lp-subin whitespace-pre-line break-keep'
                >
                  {eng.out}
                </p>
                {/* 번역문(`.lp-subin`)이 다시 뜨는데 판정 태그만 즉시 교체되면
                    카드의 반쪽만 애니메이션하는 꼴이 된다. 같은 등장을 한 박자
                    늦춰 재사용한다 — `both`가 없으면 지연 동안 옛 태그가
                    번쩍인다. */}
                <div
                  key={`t${engine}`}
                  className='flex flex-wrap gap-2 lp-subin'
                  style={{ animationDelay: '80ms', animationFillMode: 'both' }}
                >
                  {eng.tags.map((tag) => (
                    <span
                      key={tag.label}
                      className={`lp-tag ${TAG_CLASS[tag.tone]}`}
                    >
                      {tag.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <p
              className='mt-7 mx-auto max-w-full text-center text-sm text-tertiary leading-[1.6] break-keep whitespace-normal sm:whitespace-pre-line reveal'
              style={revealDelay(4)}
            >
              {L.compare.outro}
            </p>
          </div>
        </section>

        {/* ── 5. 속도 ───────────────────────────────────────────── */}
        <section
          id='speed'
          className='lp-anchor bg-ink-strong text-on-ink px-6 py-[100px]'
        >
          <div className='max-w-[880px] mx-auto grid grid-cols-[repeat(auto-fit,minmax(320px,1fr))] gap-14 items-center'>
            <div className='reveal'>
              <h2 className='lp-h2-dark mb-4'>
                {L.speed.titleTop}
                <br />
                <span style={{ color: 'var(--accent)' }}>
                  {L.speed.titleAccent}
                </span>
              </h2>
              <p
                className='mb-7 text-[16px] leading-[1.6] max-w-full break-keep whitespace-normal sm:whitespace-pre-line'
                style={{ color: 'rgba(250,249,245,0.6)' }}
              >
                {L.speed.body}
              </p>
              {/* 다크 섹션에서만 옐로 버튼을 쓴다. */}
              <Cta
                location='speed'
                onSignIn={onSignIn}
                configured={configured}
                className='lp-btn lp-btn-accent text-[15px] px-[26px] py-3'
              />
              {/* 15초의 실측 조건을 문구 옆에 붙여 둔다 — 조건 없이 쓰면
                  두 웨이브로 넘어가는 파일(1,600블록 초과, 17.8초)에 대해
                  거짓이 된다(COPY.landing.speed 주석). */}
              <p
                className='mt-5 max-w-[400px] text-fineprint leading-[1.6] break-keep'
                style={{ color: 'rgba(250,249,245,0.4)' }}
              >
                {L.speed.note}
              </p>
            </div>

            {/* 이 목록은 내용 자체가 "15초 동안 무슨 일이 일어나는가"다. 한 행씩
                차례로 올라오게 해서 경과 시간을 모션으로도 읽히게 한다. */}
            <ol className='flex flex-col list-none m-0 p-0'>
              {L.speed.steps.map((step, i) => (
                <li key={step.time} className='lp-step reveal' style={revealDelay(i)}>
                  <span className='lp-step-time'>{step.time}</span>
                  <div>
                    <div className='lp-step-title'>{step.title}</div>
                    <div className='lp-step-desc break-keep'>{step.desc}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ── 6. CPS 자동 조정 ──────────────────────────────────── */}
        <section id='cps' className='lp-anchor bg-bg px-6 py-24'>
          <div className='max-w-[880px] mx-auto'>
            <h2 className='lp-h2 mb-2.5 reveal'>{L.cps.title}</h2>
            <p
              className='lp-section-sub max-w-full mb-9 leading-[1.55] break-keep whitespace-normal sm:whitespace-pre-line reveal'
              style={revealDelay(1)}
            >
              {L.cps.sub}
            </p>

            <div className='reveal' style={revealDelay(2)}>
              <Segmented
                label={L.cps.tablistLabel}
                idPrefix='cps'
                options={L.cps.profiles.map((p) => p.name)}
                value={profile}
                onChange={setProfile}
                onCanvas
                className='w-fit max-w-full flex-wrap mb-6'
              />
            </div>

            {/* 카드 자신은 프로필을 바꿀 때마다 key로 리마운트된다 — `.reveal`을
                직접 걸면 새 노드가 `.is-visible` 없이 태어나 영영 투명해진다.
                리빌은 리마운트되지 않는 래퍼가 맡는다. */}
            <div className='reveal' style={revealDelay(3)}>
              <div
                key={`c${profile}`}
                id='cps-panel'
                role='tabpanel'
                aria-live='polite'
                aria-labelledby={`cps-tab-${profile}`}
                className='lp-cps-card'
              >
                <div className='flex flex-col gap-[18px]'>
                  <div>
                    <div className='text-caption font-semibold text-tertiary mb-1.5'>
                      {L.cps.speedLabel}
                    </div>
                    <div className='lp-cps-value'>
                      {cps.value}
                      <span className='lp-cps-unit'>{L.cps.unit}</span>
                    </div>
                  </div>
                  <div className='flex flex-col gap-2.5'>
                    <div className='lp-spec'>
                      <span>{L.cps.lineCountLabel}</span>
                      <b>{L.cps.lineCountValue}</b>
                    </div>
                    <div className='lp-spec'>
                      <span>{L.cps.actionLabel}</span>
                      <b className='break-keep whitespace-normal sm:whitespace-pre-line'>{cps.action}</b>
                    </div>
                  </div>
                </div>

                <div className='lp-preview'>
                  <div className='text-center flex flex-col gap-1'>
                    {cps.lines.map((line) => (
                      <span key={line} className='lp-preview-line'>
                        {line}
                      </span>
                    ))}
                  </div>
                  <div className='lp-preview-meta'>
                    <span>{cps.tc}</span>
                    <span style={{ color: 'var(--accent)' }}>{cps.measured}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 7. 라이트 vs 프로 ─────────────────────────────────── */}
        {/* 설정 화면의 "?" 팝오버(`TranslateSettingsStep`)와 같은
            `COPY.plans`를 읽는다 — 여기서 갈라지면 랜딩이 약속한 시간과
            설정 화면이 보여주는 시간이 서로 다른 숫자가 된다. */}
        <section className='bg-surface border-t border-border-subtle px-6 py-24'>
          <div className='max-w-[880px] mx-auto'>
            <h2 className='lp-h2 text-center mb-2.5 reveal'>{PLANS.title}</h2>
            <p
              className='lp-section-sub text-center max-w-[480px] mx-auto mb-10 break-keep reveal'
              style={revealDelay(1)}
            >
              {PLANS.sub}
            </p>

            <div className='lp-plan-grid reveal' style={revealDelay(2)}>
              {[PLANS.lite, PLANS.pro].map((plan) => (
                <div key={plan.name} className='lp-plan-card'>
                  <div className='lp-plan-name'>{plan.name}</div>
                  <div className='lp-plan-time'>{plan.time}</div>
                  <p className='lp-plan-timenote break-keep'>{plan.timeNote}</p>
                  <div className='lp-plan-rows'>
                    {PLANS.rows
                      .filter((row) => row.key !== 'time')
                      .map((row) => (
                        <div key={row.key} className='lp-plan-row'>
                          <span className='lp-plan-row-label'>{row.label}</span>
                          <span className='lp-plan-row-value break-keep'>
                            {plan[row.key as keyof typeof plan]}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. 기능 벤토 ──────────────────────────────────────── */}
        <section className='bg-surface border-t border-border-subtle px-6 py-24'>
          <div className='max-w-[880px] mx-auto'>
            <h2 className='lp-h2 text-center max-w-full mx-auto mb-11 whitespace-normal sm:whitespace-pre-line reveal'>
              {L.features.title}
            </h2>

            <div className='flex flex-col gap-[18px]'>
              <div className='lp-bento-wide reveal' style={revealDelay(1)}>
                <div>
                  <div className='text-[19px] font-semibold tracking-[-0.012em] mb-2'>
                    {L.features.rules.title}
                  </div>
                  <p className='m-0 text-[14.5px] text-secondary leading-[1.6] break-keep whitespace-normal sm:whitespace-pre-line'>
                    {L.features.rules.body}
                  </p>
                </div>
                <div className='flex flex-col gap-2'>
                  {L.features.rules.rows.map((row) => (
                    <div key={row.before} className='lp-rule'>
                      <span className='lp-rule-before'>{row.before}</span>
                      <span className='lp-rule-arrow' aria-hidden>
                        →
                      </span>
                      <span className='lp-rule-after'>{row.after}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className='grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-[18px]'>
                <div
                  className='lp-bento-card lp-bento-ink reveal'
                  style={revealDelay(2)}
                >
                  <div className='lp-bento-title'>
                    {L.features.formats.title}
                  </div>
                  <p
                    className='m-0 text-sm leading-[1.6] flex-1 break-keep whitespace-normal sm:whitespace-pre-line'
                    style={{ color: 'rgba(250,249,245,0.55)' }}
                  >
                    {L.features.formats.body}
                  </p>
                  <div className='flex flex-wrap gap-2'>
                    {L.features.formats.chips.map((chip) => (
                      <span key={chip} className='lp-fmt'>
                        {chip}
                      </span>
                    ))}
                  </div>
                </div>

                <div
                  className='lp-bento-card lp-bento-accent reveal'
                  style={revealDelay(3)}
                >
                  <div className='lp-bento-title'>
                    {L.features.languages.title}
                  </div>
                  <p
                    className='m-0 text-sm leading-[1.6] flex-1 break-keep'
                    style={{ color: 'rgba(22,22,20,0.65)' }}
                  >
                    {L.features.languages.body}
                  </p>
                  <div
                    className='mono text-[12.5px] tracking-[0.03em]'
                    style={{ color: 'rgba(22,22,20,0.6)' }}
                  >
                    {L.features.languages.codes}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── 9. 최종 CTA ───────────────────────────────────────── */}
        <section className='text-center px-6 pt-[110px] pb-[90px]'>
          <h2 className='lp-h2-final mb-3.5 whitespace-normal sm:whitespace-pre-line reveal'>
            {L.final.title}
          </h2>
          <p className='lp-section-sub mb-8 break-keep reveal' style={revealDelay(1)}>
            {L.final.sub}
          </p>
          {/* 리빌은 버튼이 아니라 래퍼에 건다 — `.lp-btn`의 누름 transition(0.15s)이
              레이어 밖 `.reveal`의 0.55s에 밀려 눌림이 물러진다. */}
          <div className='reveal' style={revealDelay(2)}>
            <Cta
              location='footer'
              onSignIn={onSignIn}
              configured={configured}
              className='lp-btn lp-btn-ink text-[16px] px-8 py-[14px]'
            />
          </div>
          <p
            className='mt-[52px] flex items-center justify-center gap-1.5 text-fineprint text-quaternary reveal'
            style={revealDelay(3)}
          >
            {/* 앱의 "확인 필요" 인디케이터와 같은 숨쉬는 점 — 페이지 끝의 이
                한 곳만 살아 있게 둔다. */}
            <span className='zchip-dot animate-zbreathe w-[5px] h-[5px]' aria-hidden />
            {L.final.badge}
          </p>
        </section>
      </main>

      {/* ── 10. Footer ────────────────────────────────────────── */}
      {/* §1-11의 세 번째 노출 지점. 로그인 전 화면은 이 푸터가 유일한 약관
          경로다 — 로그인 후 셸에는 익명 방문자가 닿지 못한다. */}
      <SiteFooter />
    </div>
  );
}
