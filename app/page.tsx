import styles from "./page.module.css";

const symbols = [
  { char: "+", top: "12%", left: "8%", color: "var(--brand-red)", delay: "0s", size: "3.2rem" },
  { char: "÷", top: "22%", left: "86%", color: "var(--brand-blue)", delay: "1.2s", size: "3.6rem" },
  { char: "×", top: "72%", left: "12%", color: "var(--brand-yellow)", delay: "2.4s", size: "3.4rem" },
  { char: "π", top: "78%", left: "82%", color: "var(--brand-red)", delay: "0.6s", size: "3rem" },
  { char: "√", top: "44%", left: "4%", color: "var(--brand-blue)", delay: "1.8s", size: "2.6rem" },
  { char: "=", top: "52%", left: "92%", color: "var(--brand-yellow)", delay: "3s", size: "2.8rem" },
  { char: "∑", top: "6%", left: "56%", color: "var(--brand-yellow)", delay: "2s", size: "2.4rem" },
  { char: "%", top: "88%", left: "18%", color: "var(--brand-blue)", delay: "0.9s", size: "2.4rem" },
];

const topics = [
  { label: "Number sense", color: "var(--brand-red)" },
  { label: "Logical thinking", color: "var(--brand-blue)" },
  { label: "Problem solving", color: "var(--brand-yellow)" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.glowRed} aria-hidden />
      <div className={styles.glowBlue} aria-hidden />
      <div className={styles.glowYellow} aria-hidden />

      <div className={styles.symbols} aria-hidden>
        {symbols.map((s) => (
          <span
            key={s.char}
            className={styles.symbol}
            style={{
              top: s.top,
              left: s.left,
              color: s.color,
              fontSize: s.size,
              animationDelay: s.delay,
            }}
          >
            {s.char}
          </span>
        ))}
      </div>

      <main className={styles.main}>
        <picture className={styles.logo}>
          <source srcSet="/logo-white.svg" media="(prefers-color-scheme: dark)" />
          <img src="/logo-color.svg" alt="Mathology by Logicology" width={760} height={680} />
        </picture>

        <span className={styles.badge}>
          <span className={styles.dot} />
          Coming soon
        </span>

        <h1 className={styles.title}>
          Something great is <span className={styles.highlight}>adding up.</span>
        </h1>

        <p className={styles.lead}>
          We&apos;re building a brighter, more playful way for young minds to learn maths.
          Stay tuned — the launch is just around the corner.
        </p>

        <ul className={styles.topics}>
          {topics.map((t) => (
            <li key={t.label} className={styles.topic}>
              <span className={styles.topicDot} style={{ background: t.color }} />
              {t.label}
            </li>
          ))}
        </ul>
      </main>

      <footer className={styles.footer}>
        © {new Date().getFullYear()} Mathology · by Logicology
      </footer>
    </div>
  );
}
