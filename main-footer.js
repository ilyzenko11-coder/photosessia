(() => {
  const footerMarkup = `
    <div class="footer-top">
      <div class="footer-contact-block">
        <p class="footer-title">Контакты</p>
        <div class="footer-socials">
          <a class="social-link" href="https://t.me/khoruzhenko_nataly" aria-label="Telegram"><img src="img/social-telegram.png" alt="" /></a>
          <a class="social-link" href="https://max.ru/u/f9LHodD0cOLBq1trg3ctk1oujiVY9LP8ciax4O8db_CDsbIM1cx2tUGCV8c" aria-label="MAX"><img src="img/social-max.png" alt="" /></a>
          <a class="social-link" href="https://www.instagram.com/khoruzhenko_natalya?igsh=MXJnbW04OHd2ZDZqdw%3D%3D" aria-label="Instagram"><img src="img/social-instagram.png" alt="" /></a>
          <a class="social-link" href="https://vk.ru/khoruzhenko_natalya" aria-label="VK"><img src="img/social-vk.png" alt="" /></a>
        </div>
        <div class="footer-phone">Телефон: +7 913 945 4927</div>
      </div>
      <div class="footer-invite">
        <h2 class="footer-invite-title">Останемся на связи?</h2>
        <p class="footer-invite-text">В Telegram и MAX я продолжаю говорить<br />о красоте, которая рождается не перед камерой,<br />а внутри женщины.</p>
        <div class="footer-invite-links">
          <a class="footer-invite-link" href="https://t.me/khoruzhenko_nataly">Перейти в Telegram</a>
          <a class="footer-invite-link" href="https://max.ru/join/Ky_laijAnAXNXVZiBa8XL-ct-ZNSgVSWyO0Qg3uQMKg">Перейти в MAX</a>
        </div>
      </div>
    </div>
    <div class="footer-actions">
      <button class="footer-text-button" type="button" data-main-footer-callback>Заказать обратный звонок</button>
      <a class="footer-text-button" href="privacy.html" target="_blank" rel="noopener">Политика конфиденциальности</a>
      <a class="footer-text-button" href="offer.html" target="_blank" rel="noopener">Оферта</a>
    </div>
    <p class="footer-copy">© ИП Хоруженко Наталья Петровна. Все материалы данного сайта являются объектами авторского права. Запрещается копирование, распространение и любое иное использование материалов без предварительного письменного согласия правообладателя. Отправляя любую форму на сайте, вы даете <a class="footer-consent-button" href="consent.html" target="_blank" rel="noopener">согласие на обработку персональных данных</a>.</p>
  `;

  function createCallbackModal() {
    const existingModal = document.querySelector(".main-callback-overlay");
    if (existingModal) return existingModal;

    const modal = document.createElement("div");
    modal.className = "main-callback-overlay";
    modal.hidden = true;
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "main-callback-title");
    modal.innerHTML = `
      <div class="main-callback-modal">
        <button class="main-callback-close" type="button" aria-label="Закрыть форму">&times;</button>
        <h2 class="main-callback-title" id="main-callback-title">Оставьте ваши<br />контактные данные, и я<br />с вами свяжусь</h2>
        <form class="main-callback-form" action="https://formsubmit.co/ilyzenko11@gmail.com" method="POST" novalidate>
          <input type="hidden" name="_subject" value="Заявка на обратный звонок с сайта" />
          <input type="hidden" name="_captcha" value="false" />
          <input type="hidden" name="Телефон полностью" value="" data-main-full-phone />
          <label class="main-callback-field">
            <input class="main-callback-input" name="Имя" type="text" placeholder="Ваше Имя" autocomplete="name" />
            <span class="main-callback-error" data-main-error="name"></span>
          </label>
          <div class="main-callback-field">
            <div class="main-callback-phone-row">
              <select class="main-callback-select" name="Страна" aria-label="Страна телефона">
                <option value="Россия +7">Россия +7</option>
                <option value="Казахстан +7">Казахстан +7</option>
                <option value="Беларусь +375">Беларусь +375</option>
                <option value="Другая страна">Другая страна</option>
              </select>
              <input class="main-callback-input" name="Телефон" type="tel" placeholder="(000) 000-0000" autocomplete="tel" />
            </div>
            <span class="main-callback-error" data-main-error="phone"></span>
          </div>
          <label class="main-callback-field">
            <select class="main-callback-select" name="Удобный мессенджер">
              <option value="">Удобный мессенджер</option>
              <option value="Telegram">Telegram</option>
              <option value="MAX">MAX</option>
              <option value="WhatsApp">WhatsApp</option>
              <option value="Телефонный звонок">Телефонный звонок</option>
            </select>
            <span class="main-callback-error" data-main-error="messenger"></span>
          </label>
          <label class="main-callback-field">
            <input class="main-callback-input" name="Email" type="email" placeholder="Email" autocomplete="email" />
            <span class="main-callback-error" data-main-error="email"></span>
          </label>
          <label class="main-callback-field">
            <span class="main-callback-label" data-main-captcha-label>Капча</span>
            <input class="main-callback-input" name="Капча" type="text" inputmode="numeric" />
            <span class="main-callback-error" data-main-error="captcha"></span>
          </label>
          <button class="main-callback-submit" type="submit">Отправить</button>
          <p class="main-callback-note">После отправки данные придут на email: ilyzenko11@gmail.com</p>
        </form>
      </div>
    `;
    document.body.append(modal);

    const form = modal.querySelector(".main-callback-form");
    const closeButton = modal.querySelector(".main-callback-close");
    const setError = (field, message) => {
      const error = form.querySelector(`[data-main-error="${field}"]`);
      if (error) error.textContent = message;
    };
    const closeModal = () => {
      modal.hidden = true;
      document.body.classList.remove("main-callback-open");
    };

    closeButton.addEventListener("click", closeModal);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) closeModal();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !modal.hidden) closeModal();
    });

    form.addEventListener("submit", (event) => {
      const name = form.querySelector('[name="Имя"]').value.trim();
      const phone = form.querySelector('[name="Телефон"]').value.trim();
      const country = form.querySelector('[name="Страна"]').value;
      const messenger = form.querySelector('[name="Удобный мессенджер"]').value;
      const email = form.querySelector('[name="Email"]').value.trim();
      const captcha = form.querySelector('[name="Капча"]').value.trim();
      const phoneDigits = phone.replace(/\D/g, "");
      const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      let valid = true;

      ["name", "phone", "messenger", "email", "captcha"].forEach((field) => setError(field, ""));
      if (!name) {
        setError("name", "Введите имя.");
        valid = false;
      }
      if (phoneDigits.length < 6) {
        setError("phone", "Введите корректный номер телефона.");
        valid = false;
      }
      if (!messenger) {
        setError("messenger", "Выберите удобный способ связи.");
        valid = false;
      }
      if (!emailIsValid) {
        setError("email", "Введите корректный email.");
        valid = false;
      }
      if (captcha !== form.dataset.captchaAnswer) {
        setError("captcha", "Неверный ответ.");
        valid = false;
      }

      if (!valid) {
        event.preventDefault();
        return;
      }
      form.querySelector("[data-main-full-phone]").value = `${country}: ${phone}`;
    });

    return modal;
  }

  function openFooterCallback() {
    const modal = createCallbackModal();
    const firstNumber = Math.floor(Math.random() * 8) + 1;
    const secondNumber = Math.floor(Math.random() * 8) + 1;
    const form = modal.querySelector(".main-callback-form");
    form.dataset.captchaAnswer = String(firstNumber + secondNumber);
    modal.querySelector("[data-main-captcha-label]").textContent = `Сколько будет ${firstNumber} + ${secondNumber}?`;
    modal.hidden = false;
    document.body.classList.add("main-callback-open");
    window.setTimeout(() => form.querySelector('[name="Имя"]').focus(), 0);
  }

  let footer = document.querySelector(".site-footer");
  if (!footer) {
    footer = document.createElement("footer");
    footer.className = "site-footer";
    const container = document.querySelector(".page") || document.body;
    container.append(footer);
  }

  footer.innerHTML = footerMarkup;
  footer.querySelector("[data-main-footer-callback]")?.addEventListener("click", () => {
    if (typeof window.openCallback === "function") {
      window.openCallback();
      return;
    }

    const pageCallback = Array.from(document.querySelectorAll("[data-open-callback]")).find((node) => !footer.contains(node));
    if (pageCallback) {
      pageCallback.click();
      return;
    }

    openFooterCallback();
  });

  document.querySelectorAll("[data-main-callback]").forEach((button) => {
    button.addEventListener("click", openFooterCallback);
  });
})();
