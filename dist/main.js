const stage = document.querySelector('.stage');
const buttons = document.querySelectorAll('.expression-controls button');
for (const button of buttons) {
  button.addEventListener('click', () => {
    stage.dataset.expression = button.dataset.expression;
    for (const candidate of buttons) candidate.setAttribute('aria-pressed', String(candidate === button));
  });
}

