const toast = document.querySelector('#toast');
function notify(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => toast.classList.remove('show'), 1800);
}

document.querySelector('#demo-accept')?.addEventListener('click', (event) => {
  const sheet = event.currentTarget.closest('.proof-sheet');
  const accepted = sheet.classList.toggle('accepted');
  event.currentTarget.textContent = accepted ? '수락 취소' : '이 문장 수락';
  event.currentTarget.setAttribute('aria-pressed', String(accepted));
  sheet.querySelector('.status-dot').textContent = accepted ? '수락됨' : '검토 전';
  notify(accepted ? '제안 문장을 선택했습니다.' : '선택을 취소했습니다.');
});

document.querySelectorAll('[data-copy]').forEach((button) => {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.dataset.copy);
      notify('명령을 복사했습니다.');
    } catch {
      notify('명령을 선택해 직접 복사해 주세요.');
    }
  });
});
