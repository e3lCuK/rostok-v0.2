import {
  Clock,
  Gamepad2,
  HeartHandshake,
  MessageCircle,
  Phone,
  PiggyBank,
  Repeat,
  Shovel,
  Sparkles,
  Sprout,
  TreePine,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import RostokTreeIcon from "@/components/RostokTreeIcon";
import rostokTree from "@/assets/rostok-tree.png";
import { TUTORIAL_PLAN_ICON_COLORS } from "@/lib/tutorialFlow";

interface Props {
  onLogin: () => void;
  onRegister: () => void;
}

const BANK_REASONS = [
  {
    text: "Игровой формат повышает лояльность и\u00A0вовлечённость клиентов",
    Icon: HeartHandshake,
  },
  {
    text: "Клиенты дольше держат деньги на\u00A0счетах, формируя стабильную ресурсную базу",
    Icon: PiggyBank,
  },
  {
    text: "Ежедневное взаимодействие создаёт возможности для\u00A0кросс-продаж",
    Icon: Repeat,
  },
  {
    text: "Банк выделяется на\u00A0рынке и\u00A0привлекает молодую аудиторию",
    Icon: Users,
  },
] as const;

const CLIENT_REASONS = [
  {
    text: "Накопление становится ежедневным игровым ритуалом, а\u00A0не\u00A0скучной обязанностью",
    Icon: Gamepad2,
  },
  {
    text: "Видимый прогресс (дерево растёт вместе с\u00A0капиталом) мотивирует продолжать",
    Icon: Sprout,
  },
  {
    text: "Проценты по\u00A0вкладу работают, а\u00A0игра даёт дополнительный бонус",
    Icon: TrendingUp,
  },
  {
    text: "Копить становится легко и\u00A0интересно",
    Icon: Sparkles,
  },
] as const;

const FLOW_STEPS = [
  {
    label: "Капитал и\u00A0время",
    Icon: Clock,
    color: TUTORIAL_PLAN_ICON_COLORS.wait,
  },
  {
    label: "Игровая энергия",
    Icon: Zap,
    color: TUTORIAL_PLAN_ICON_COLORS.energy,
  },
  {
    label: "Игра",
    Icon: Gamepad2,
    color: "#2b7fff",
  },
  {
    label: "Уход",
    Icon: Shovel,
    color: TUTORIAL_PLAN_ICON_COLORS.care,
  },
  {
    label: "Рост дерева",
    Icon: TreePine,
    color: TUTORIAL_PLAN_ICON_COLORS.plant,
  },
] as const;

function AudienceEulerDiagram() {
  return (
    <div className="landing-euler-wrap">
      <svg
        className="landing-euler"
        viewBox="0 0 320 200"
        role="img"
        aria-label="Два пересекающихся круга: интерес к накоплению и любовь к играм. В пересечении — Росток."
      >
        <circle
          className="landing-euler-circle landing-euler-circle--save"
          cx="118"
          cy="100"
          r="78"
        />
        <circle
          className="landing-euler-circle landing-euler-circle--play"
          cx="202"
          cy="100"
          r="78"
        />
        <text className="landing-euler-label" x="88" y="96" textAnchor="middle">
          <tspan x="88" dy="0">
            Интерес к
          </tspan>
          <tspan x="88" dy="14">
            накоплению
          </tspan>
        </text>
        <text className="landing-euler-label" x="242" y="96" textAnchor="middle">
          <tspan x="242" dy="0">
            Любовь
          </tspan>
          <tspan x="242" dy="14">
            к играм
          </tspan>
        </text>
        <g className="landing-euler-center" transform="translate(160 100)">
          <image
            href={rostokTree}
            x={-16}
            y={-26}
            width={32}
            height={32}
            preserveAspectRatio="xMidYMid meet"
          />
          <text y="38" textAnchor="middle">
            Росток
          </text>
        </g>
      </svg>
    </div>
  );
}

export default function LandingPage({ onLogin, onRegister }: Props) {
  return (
    <div className="bank-app">
      <div className="landing-wrap">
        <div className="landing-card">
          <div className="auth-logo">
            <span className="landing-logo-tree" aria-hidden="true">
              <RostokTreeIcon size={64} />
            </span>
            <div className="landing-logo-text-wrap">
              <span className="auth-logo-text">Росток</span>
              <span className="landing-logo-tagline">
                Растите капитал играючи
              </span>
            </div>
          </div>

          <button type="button" className="auth-submit" onClick={onRegister}>
            Начать играть
          </button>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">Что такое «Росток»</h2>
            <p className="landing-text">
              «Росток» — мобильная игра, которая превращает накопление денег
              в{"\u00A0"}игровой процесс.
            </p>
            <p className="landing-text">
              «Росток» формирует привычку регулярно откладывать и{"\u00A0"}сохранять
              настоящие деньги, также как игра «Дуолинго» формирует привычку
              регулярно изучать языки.
            </p>
            <p className="landing-text">
              В{"\u00A0"}основе — ферма: вы{"\u00A0"}выращиваете дерево, ухаживаете
              за{"\u00A0"}ним и{"\u00A0"}развиваете свой сад.
            </p>
            <p className="landing-text">
              Чем дольше ваши деньги находятся в{"\u00A0"}накоплении, тем быстрее
              формируется игровая энергия для{"\u00A0"}ухода за{"\u00A0"}деревом.{" "}
              <strong>
                При этом играть можно и{"\u00A0"}без капитала
              </strong>{" "}
              — он{"\u00A0"}не{"\u00A0"}обязателен, а{"\u00A0"}лишь ускоряет накопление
              энергии.
            </p>
          </section>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">Как это работает</h2>
            <ol className="landing-flow" aria-label="Цепочка игрового цикла">
              {FLOW_STEPS.map(({ label, Icon, color }, i) => (
                <li key={label} className="landing-flow-step">
                  {i > 0 ? (
                    <span className="landing-flow-arrow" aria-hidden="true">
                      ↓
                    </span>
                  ) : null}
                  <span className="landing-flow-chip" style={{ color }}>
                    <Icon size={16} strokeWidth={2.25} aria-hidden="true" />
                    <span>{label}</span>
                  </span>
                </li>
              ))}
            </ol>
            <p className="landing-text">
              Капитал и{"\u00A0"}время дают игровую энергию. Энергией вы{"\u00A0"}играете
              и{"\u00A0"}ухаживаете за{"\u00A0"}деревом — сад растёт.
            </p>
          </section>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">Зачем это игрокам?</h2>
            <div className="landing-benefit-list">
              {CLIENT_REASONS.map(({ text, Icon }) => (
                <div key={text} className="landing-benefit">
                  <span className="landing-benefit-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2.25} />
                  </span>
                  <p className="landing-text landing-benefit-text">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">
              Две привычки встречаются в{"\u00A0"}одном месте
            </h2>
            <p className="landing-text">
              «Росток» — для{"\u00A0"}тех, кому нравятся игры, и{"\u00A0"}для{"\u00A0"}тех,
              кто хочет научиться копить. Играть можно даже без капитала. Если
              капитал работает — он{"\u00A0"}ускоряет игровой прогресс.
            </p>
            <AudienceEulerDiagram />
          </section>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">Зачем это банкам?</h2>
            <div className="landing-benefit-list">
              {BANK_REASONS.map(({ text, Icon }) => (
                <div key={text} className="landing-benefit">
                  <span className="landing-benefit-icon" aria-hidden="true">
                    <Icon size={20} strokeWidth={2.25} />
                  </span>
                  <p className="landing-text landing-benefit-text">{text}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="landing-divider" />

          <section className="landing-section">
            <h2 className="landing-section-h">Контакты</h2>
            <div className="landing-contacts">
              <p className="landing-contacts-name">Егор Алексеевич Капица</p>
              <a className="landing-contacts-row" href="tel:+79216443069">
                <span className="landing-contacts-icon" aria-hidden="true">
                  <Phone size={16} strokeWidth={2.25} />
                </span>
                <span>79216443069 — мобильный</span>
              </a>
              <a
                className="landing-contacts-row"
                href="https://t.me/kot_begemot_egor_kapitsa"
                target="_blank"
                rel="noreferrer"
              >
                <span className="landing-contacts-icon" aria-hidden="true">
                  <MessageCircle size={16} strokeWidth={2.25} />
                </span>
                <span>@kot_begemot_egor_kapitsa — телеграм</span>
              </a>
            </div>
          </section>

          <div className="landing-divider" />

          <section className="landing-cta-section">
            <p className="landing-cta-text">Посадите своё первое дерево.</p>
            <button type="button" className="auth-submit" onClick={onRegister}>
              Начать играть
            </button>
            <button type="button" className="landing-login-link" onClick={onLogin}>
              Уже есть аккаунт — войти
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
