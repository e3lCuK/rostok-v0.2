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

          {/* 1. Описание игры */}
          <section className="landing-section">
            <h2 className="landing-section-h">Что такое Росток?</h2>
            <p className="landing-text">
              Росток — это игровой интерфейс поверх накопительного счёта, созданный
              с разрешения клиента банка. Приложение отслеживает рост вклада и превращает
              ежедневный уход за капиталом в увлекательную игру: вы ухаживаете за
              виртуальным деревом, и оно растёт вместе с вашими накоплениями.
            </p>
            <p className="landing-text">
              Идея простая: <strong>Duolingo в мире накопительных счетов.</strong> Так же,
              как языковое приложение превращает скучную учёбу в ежедневный ритуал —
              Росток превращает слежение за вкладом в привычку. Вы открываете приложение
              каждый день не потому что «надо», а потому что интересно посмотреть,
              как вырос ваш капитал и дерево.
            </p>
            <p className="landing-text">
              В результате формируется финансовая дисциплина: привычка сберегать,
              регулярно пополнять вклад и следить за ростом накоплений, чтобы
              достигать своих финансовых целей.
            </p>
          </section>

          <div className="landing-divider" />

          {/* 2. Три мини-игры */}
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
                <span className="landing-minigame-icon">🫘</span>
                <div>
                  <div className="landing-minigame-name">Удобрение</div>
                  <div className="landing-minigame-desc">Гранулы удобрения на поле — собирайте три одного цвета в ряд. Чем длиннее серия, тем выше очки.</div>
                </div>
              </div>
            </div>
          </section>

          <div className="landing-divider" />

          {/* 3. Дерево растёт */}
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

          {/* 4. Зачем возвращаться */}
          <section className="landing-section">
            <h2 className="landing-section-h">Зачем возвращаться каждый день</h2>
            <ul className="landing-perk-list">
              <li><span className="landing-perk-icon">🔥</span>Серия не прерывается — бонусный множитель держится на максимуме</li>
              <li><span className="landing-perk-icon">🏆</span>Опыт и уровни за каждую сессию — таблица рейтинга среди всех игроков</li>
              <li><span className="landing-perk-icon">📈</span>Сложный процент: доход каждый день начисляется на уже выросший капитал</li>
              <li><span className="landing-perk-icon">🎯</span>Улучшение навыка: со временем мини-игры даются легче, бонус растёт</li>
            </ul>
          </section>

          <div className="landing-divider" />

          {/* 5. Как начисляется доход */}
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

            {/* Супер-сессия */}
            <div className="landing-supersession">
              <div className="landing-supersession-left">
                <span className="landing-supersession-icon">⚡</span>
              </div>
              <div className="landing-supersession-body">
                <span className="landing-supersession-title">Супер-сессия</span>
                <p className="landing-supersession-text">
                  Пропущенные дни не сгорают: сессии накапливаются, и при следующем
                  входе вы получите всё сразу — с повышенным множителем. Вернулись
                  через три дня? Один вход закроет все пропуски.
                </p>
              </div>
            </div>

            <div className="landing-note">
              <span className="landing-note-icon">ℹ️</span>
              <p className="landing-note-text">
                <strong>О процентной ставке.</strong> Текущие ставки (12% + до 3%) —
                тестовые, используются для демонстрации механики. В боевой версии
                ставки будут привязаны к реальным ставкам ЦБ РФ и условиям
                конкретного банка-партнёра.
              </p>
            </div>
          </section>

          <div className="landing-divider" />

          {/* 6. Как банки становятся партнёрами */}
          <section className="landing-section">
            <h2 className="landing-section-h">Как банки становятся партнёрами</h2>
            <p className="landing-text">
              Росток разработан как игровой слой поверх реального накопительного счёта.
              Банк-партнёр предоставляет API-доступ к счёту — с явного разрешения
              клиента — и игра начинает отслеживать реальный баланс вместо
              демонстрационного. Для клиента ничего не меняется: тот же вклад,
              тот же банк, но теперь с игровым интерфейсом.
            </p>
            <div className="landing-api-flow">
              <div className="landing-api-step">
                <span className="landing-api-num">1</span>
                <div>
                  <strong>Клиент даёт разрешение</strong>
                  <p>При подключении клиент авторизует доступ к своему накопительному счёту через OAuth-протокол банка — по аналогии с открытым банкингом (Open Banking).</p>
                </div>
              </div>
              <div className="landing-api-step">
                <span className="landing-api-num">2</span>
                <div>
                  <strong>Игра читает реальный баланс</strong>
                  <p>Росток подключается к API банка и отображает актуальный баланс вклада — дерево растёт вместе с настоящими накоплениями, доход начисляется по реальным ставкам банка.</p>
                </div>
              </div>
              <div className="landing-api-step">
                <span className="landing-api-num">3</span>
                <div>
                  <strong>Банк получает вовлечённых клиентов</strong>
                  <p>Ежедневный ритуал в игре удерживает средства на счёте и снижает отток: клиент видит рост своих реальных накоплений каждый день и реже снимает деньги.</p>
                </div>
              </div>
            </div>
            <div className="landing-note" style={{ marginTop: 14 }}>
              <span className="landing-note-icon">🏦</span>
              <p className="landing-note-text">
                <strong>Для банков:</strong> интеграция возможна через открытый API с OAuth 2.0.
                Росток работает с любым банком, предоставляющим API-доступ к накопительным счетам
                с разрешения клиентов — стандарт Open Banking / ПСД2-совместимые интерфейсы.
              </p>
            </div>
          </section>

          <div className="landing-divider" />

          {/* 7. Зачем клиентам */}
          <section className="landing-section">
            <h2 className="landing-section-h">Зачем это клиентам банка?</h2>
            <p className="landing-text">
              Большинство людей понимают, что копить важно — но редко делают это
              регулярно. Причина не в нехватке денег, а в отсутствии привычки
              и видимого прогресса.
            </p>
            <div className="landing-income-list">
              <div className="landing-income-item landing-income-base">
                <div className="landing-income-top">
                  <span className="landing-income-emoji">🎯</span>
                  <span className="landing-income-name">Финансовая дисциплина через игру</span>
                </div>
                <p className="landing-income-desc">
                  Игровой интерфейс формирует ежедневный ритуал: зайти, пройти мини-игры,
                  увидеть рост дерева и капитала. Привычка складывается сама — без
                  напоминаний и самодисциплины.
                </p>
              </div>
              <div className="landing-income-item landing-income-bonus">
                <div className="landing-income-top">
                  <span className="landing-income-emoji">📈</span>
                  <span className="landing-income-name">Видимый прогресс мотивирует</span>
                </div>
                <p className="landing-income-desc">
                  Дерево растёт, уровень повышается, капитал увеличивается —
                  всё это видно каждый день. Наглядный результат мотивирует
                  пополнять вклад и не снимать накопленное.
                </p>
              </div>
            </div>
          </section>

          <div className="landing-divider" />

          {/* 8. Зачем банкам */}
          <section className="landing-section">
            <h2 className="landing-section-h">Зачем это банкам?</h2>
            <p className="landing-text">
              Чем больше клиентов сберегают деньги — тем меньше средств выводится
              из системы. Это напрямую выгодно банку: стабильная база вкладчиков
              снижает потребность в дорогом привлечении ликвидности.
            </p>
            <ul className="landing-perk-list">
              <li>
                <span className="landing-perk-icon">🏦</span>
                Больше вкладчиков, дольше держат деньги — банк получает
                стабильную и дешёвую ресурсную базу
              </li>
              <li>
                <span className="landing-perk-icon">📱</span>
                Ежедневное присутствие клиента в приложении — ценный
                актив: внимание аудитории можно монетизировать через
                партнёрские предложения и финансовые продукты
              </li>
              <li>
                <span className="landing-perk-icon">🤝</span>
                Лояльность и вовлечённость клиентов выше — игровой формат
                создаёт эмоциональную привязанность к бренду банка
              </li>
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
