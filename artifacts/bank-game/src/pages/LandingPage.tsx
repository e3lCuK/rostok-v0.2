interface Props {
  onLogin: () => void;
  onRegister: () => void;
}

export default function LandingPage({ onLogin, onRegister }: Props) {
  return (
    <div className="landing-page">
      <header className="landing-header">
        <div className="landing-logo">
          <span className="landing-logo-tree">🌳</span>
          <span className="landing-logo-name">Росток</span>
        </div>
        <div className="landing-header-btns">
          <button className="landing-btn-outline" onClick={onLogin}>Войти</button>
          <button className="landing-btn-solid" onClick={onRegister}>Создать аккаунт</button>
        </div>
      </header>

      <div className="landing-body">

        <section className="landing-hero">
          <div className="landing-hero-tree">🌳</div>
          <h1 className="landing-title">Растите дерево —<br />растите капитал</h1>
          <p className="landing-subtitle">
            Росток — это игровой вклад. Каждый день ухаживайте за деревом
            и получайте реальный доход: базовый и бонусный.
          </p>
        </section>

        <section className="landing-how">
          <h2 className="landing-section-title">Как это работает</h2>
          <div className="landing-steps">
            <div className="landing-step">
              <div className="landing-step-icon">💧</div>
              <div className="landing-step-body">
                <div className="landing-step-name">Вода</div>
                <div className="landing-step-desc">Ловите падающие капли — чем точнее, тем выше бонус</div>
              </div>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">☀️</div>
              <div className="landing-step-body">
                <div className="landing-step-name">Свет</div>
                <div className="landing-step-desc">Собирайте солнечные лучи по всему экрану</div>
              </div>
            </div>
            <div className="landing-step">
              <div className="landing-step-icon">🍃</div>
              <div className="landing-step-body">
                <div className="landing-step-name">Листва</div>
                <div className="landing-step-desc">Собирайте листочки в ряд — мини-игра в стиле три в ряд</div>
              </div>
            </div>
          </div>
          <p className="landing-steps-note">
            Пройдите все три активности — и дерево вырастет, а доход за день начислится.
          </p>
        </section>

        <section className="landing-income">
          <h2 className="landing-section-title">Два типа дохода</h2>
          <div className="landing-income-cards">
            <div className="landing-income-card landing-income-base">
              <div className="landing-income-label">Базовый</div>
              <div className="landing-income-rate">12% годовых</div>
              <div className="landing-income-desc">Начисляется каждый день автоматически, независимо от навыка</div>
            </div>
            <div className="landing-income-card landing-income-bonus">
              <div className="landing-income-label">Бонусный</div>
              <div className="landing-income-rate">до +3%</div>
              <div className="landing-income-desc">Зависит от вашего результата в мини-играх и регулярности сессий</div>
            </div>
          </div>
        </section>

        <section className="landing-perks">
          <h2 className="landing-section-title">Зачем играть каждый день</h2>
          <ul className="landing-perk-list">
            <li className="landing-perk">
              <span className="landing-perk-icon">🔥</span>
              <span>Серия сессий увеличивает бонусный коэффициент</span>
            </li>
            <li className="landing-perk">
              <span className="landing-perk-icon">🌱</span>
              <span>Дерево растёт вместе с вашим вкладом — до 5 стадий</span>
            </li>
            <li className="landing-perk">
              <span className="landing-perk-icon">⭐</span>
              <span>XP, уровни и таблица рейтинга среди всех игроков</span>
            </li>
            <li className="landing-perk">
              <span className="landing-perk-icon">🪙</span>
              <span>Пропущенные сессии не пропадают — они накапливаются</span>
            </li>
          </ul>
        </section>

        <section className="landing-cta">
          <div className="landing-cta-tree">🌱</div>
          <h2 className="landing-cta-title">Готовы начать?</h2>
          <p className="landing-cta-sub">Создайте аккаунт и посадите своё первое дерево</p>
          <div className="landing-cta-btns">
            <button className="landing-cta-register" onClick={onRegister}>Создать аккаунт</button>
            <button className="landing-cta-login" onClick={onLogin}>Уже есть аккаунт — войти</button>
          </div>
        </section>

      </div>
    </div>
  );
}
