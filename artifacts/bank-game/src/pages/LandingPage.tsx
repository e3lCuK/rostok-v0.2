interface Props {
  onLogin: () => void;
  onRegister: () => void;
}

export default function LandingPage({ onLogin, onRegister }: Props) {
  return (
    <div className="bank-app">
      <div className="landing-wrap">
        <div className="landing-card">

          {/* Логотип */}
          <div className="auth-logo">
            <span style={{ fontSize: "2.8rem", lineHeight: 1 }}>🌳</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "center" }}>
              <span className="auth-logo-text">Росток</span>
              <span style={{ fontSize: "0.72rem", color: "#5a7a40", fontWeight: 500 }}>Растите капитал играючи</span>
            </div>
          </div>

          {/* Кнопки входа вверху */}
          <div className="landing-auth-row">
            <button className="landing-auth-outline" onClick={onLogin}>Войти</button>
            <button className="auth-submit landing-auth-register" onClick={onRegister}>Создать аккаунт</button>
          </div>

          <div className="landing-divider" />

          {/* О проекте */}
          <section className="landing-section">
            <h2 className="landing-section-h">Что такое Росток?</h2>
            <p className="landing-text">
              Росток — это игровой вклад с ежедневными мини-играми. Вы вносите стартовый
              капитал, а потом каждый день ухаживаете за виртуальным деревом: поливаете,
              добавляете свет и собираете листву. За это дерево растёт, а вы получаете
              реальный доход.
            </p>
            <p className="landing-text">
              Проект показывает, как работает сложный процент: даже небольшие ежедневные
              начисления со временем заметно увеличивают капитал. А игровой формат
              помогает выработать привычку следить за своими финансами каждый день.
            </p>
          </section>

          <div className="landing-divider" />

          {/* Как работает доход */}
          <section className="landing-section">
            <h2 className="landing-section-h">Как начисляется доход</h2>
            <p className="landing-text">
              Доход делится на два вида: базовый и бонусный.
            </p>
            <div className="landing-income-list">
              <div className="landing-income-item landing-income-base">
                <div className="landing-income-top">
                  <span className="landing-income-emoji">🌿</span>
                  <span className="landing-income-name">Базовый — 12% годовых</span>
                </div>
                <p className="landing-income-desc">
                  Начисляется каждый день автоматически — независимо от того,
                  насколько хорошо вы сыграли. Это гарантированная часть дохода,
                  которую вы получаете просто за то, что проводите сессию.
                </p>
              </div>
              <div className="landing-income-item landing-income-bonus">
                <div className="landing-income-top">
                  <span className="landing-income-emoji">⭐</span>
                  <span className="landing-income-name">Бонусный — до +3% годовых</span>
                </div>
                <p className="landing-income-desc">
                  Зависит от вашего результата в мини-играх, размера капитала и
                  регулярности сессий. Чем точнее играете и чем реже пропускаете —
                  тем выше бонус. При длинной серии без пропусков бонусный множитель
                  сохраняется на максимуме.
                </p>
              </div>
            </div>
            <p className="landing-text" style={{ marginTop: 8 }}>
              Пропущенные дни не сгорают: сессии накапливаются (до нескольких штук),
              и при следующем входе вы сможете получить всё сразу — это называется
              «Супер-сессия».
            </p>
          </section>

          <div className="landing-divider" />

          {/* Три мини-игры */}
          <section className="landing-section">
            <h2 className="landing-section-h">Три мини-игры каждый день</h2>
            <p className="landing-text">
              Каждая сессия состоит из трёх активностей. Можно проходить их в любом
              порядке — все три нужно выполнить, чтобы завершить сессию и получить доход.
            </p>
            <div className="landing-minigames">
              <div className="landing-minigame">
                <span className="landing-minigame-icon">💧</span>
                <div>
                  <div className="landing-minigame-name">Вода</div>
                  <div className="landing-minigame-desc">Капли падают сверху — двигайте корзину и ловите как можно больше. Чем выше процент попаданий, тем лучше результат.</div>
                </div>
              </div>
              <div className="landing-minigame">
                <span className="landing-minigame-icon">☀️</span>
                <div>
                  <div className="landing-minigame-name">Свет</div>
                  <div className="landing-minigame-desc">Солнечные лучи появляются в случайных местах экрана — нажимайте на них пока не закончится время. Скорость решает.</div>
                </div>
              </div>
              <div className="landing-minigame">
                <span className="landing-minigame-icon">🍃</span>
                <div>
                  <div className="landing-minigame-name">Листва</div>
                  <div className="landing-minigame-desc">Листочки падают сверху рядами — собирайте три одного цвета подряд. Чем длиннее серия, тем выше очки.</div>
                </div>
              </div>
            </div>
          </section>

          <div className="landing-divider" />

          {/* Рост дерева и геймплей */}
          <section className="landing-section">
            <h2 className="landing-section-h">Дерево растёт вместе с вами</h2>
            <p className="landing-text">
              По мере роста капитала дерево переходит через 5 стадий — от маленького
              ростка до большого дерева. Каждый миллиметр роста отражает реальный
              прирост вклада: чем больше накопленный доход, тем выше и пышнее дерево.
            </p>
            <p className="landing-text">
              В конце каждой сессии дерево растёт в прямом эфире — вы видите анимацию
              роста и получаете яблоки (символы дохода), которые нужно собрать вручную.
              Это небольшой ритуал, который делает каждый день запоминающимся.
            </p>
          </section>

          <div className="landing-divider" />

          {/* Зачем играть */}
          <section className="landing-section">
            <h2 className="landing-section-h">Зачем возвращаться каждый день</h2>
            <ul className="landing-perk-list">
              <li><span className="landing-perk-icon">🔥</span> Серия не прерывается — бонусный множитель держится на максимуме</li>
              <li><span className="landing-perk-icon">🏆</span> XP и уровни за каждую сессию — таблица рейтинга среди всех игроков</li>
              <li><span className="landing-perk-icon">📈</span> Сложный процент: доход каждый день начисляется на уже выросший капитал</li>
              <li><span className="landing-perk-icon">🎯</span> Улучшение навыка: со временем мини-игры даются легче, бонус растёт</li>
            </ul>
          </section>

          <div className="landing-divider" />

          {/* CTA */}
          <section className="landing-cta-section">
            <p className="landing-cta-text">
              Пройдите короткий туториал, выберите стартовый капитал и посадите своё первое дерево — это займёт меньше трёх минут.
            </p>
            <button className="auth-submit" onClick={onRegister} style={{ marginBottom: 8 }}>
              Создать аккаунт и начать
            </button>
            <button className="landing-login-link" onClick={onLogin}>
              Уже есть аккаунт — войти
            </button>
          </section>

        </div>
      </div>
    </div>
  );
}
