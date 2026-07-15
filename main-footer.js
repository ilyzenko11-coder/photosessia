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

    window.location.href = "contacts.html";
  });
})();
