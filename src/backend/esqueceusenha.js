document.addEventListener('DOMContentLoaded', () => {
  const subEmail = document.getElementById('sub-screen-email');
  const subSuccess = document.getElementById('sub-screen-success');
  const passwordForm = document.getElementById('password-form');
  const passwordInput = document.getElementById('nova-senha');
  const confirmInput = document.getElementById('confirmar-senha');
  const strengthStatus = document.getElementById('strength-status');
  const strengthBar = document.getElementById('strength-bar');
  const ruleLength = document.getElementById('rule-length');
  const ruleUppercase = document.getElementById('rule-uppercase');
  const ruleNumber = document.getElementById('rule-number');
  const ruleSpecial = document.getElementById('rule-special');
  const visibilityButtons = document.querySelectorAll('.btn-visibility');
  const matchMessage = document.getElementById('match-message');
  const saveButton = document.getElementById('btn-send-email');
  const navHeader = document.getElementById('nav-header');

  if (navHeader) {
    navHeader.classList.remove('hidden');
  }

  const strengthMap = {
    empty: { label: 'Digite uma senha', color: '#6b7280', width: '0%' },
    weak: { label: 'Fraca', color: '#ef4444', width: '20%' },
    medium: { label: 'Média', color: '#eab308', width: '60%' },
    strong: { label: 'Forte', color: '#16a34a', width: '100%' },
  };

  function evaluateStrength(password) {
    if (!password) return strengthMap.empty;

    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;

    if (score >= 4) return strengthMap.strong;
    if (score >= 2) return strengthMap.medium;
    return strengthMap.weak;
  }

  function setRuleState(ruleElement, isValid) {
    if (!ruleElement) return;
    const bullet = ruleElement.querySelector('.rule-bullet');
    ruleElement.classList.toggle('valid', isValid);
    if (bullet) {
      bullet.classList.toggle('valid', isValid);
    }
  }

  function updateRequirementIndicators(password) {
    const hasLength = password.length >= 8;
    const hasUppercase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecial = /[^A-Za-z0-9]/.test(password);

    setRuleState(ruleLength, hasLength);
    setRuleState(ruleUppercase, hasUppercase);
    setRuleState(ruleNumber, hasNumber);
    setRuleState(ruleSpecial, hasSpecial);

    return hasLength && hasUppercase && hasNumber && hasSpecial;
  }

  function updateStrengthIndicator() {
    const password = passwordInput?.value || '';
    const strength = evaluateStrength(password);

    if (strengthStatus) {
      strengthStatus.textContent = strength.label;
      strengthStatus.style.color = strength.color;
    }

    if (strengthBar) {
      strengthBar.style.width = strength.width;
      strengthBar.style.backgroundColor = strength.color;
    }

    return updateRequirementIndicators(password);
  }

  function updateMatchState() {
    const password = passwordInput?.value || '';
    const confirmPassword = confirmInput?.value || '';
    const passwordsMatch = password && confirmPassword && password === confirmPassword;
    const requirementsValid = updateRequirementIndicators(password);

    if (matchMessage) {
      if (!confirmPassword) {
        matchMessage.textContent = 'Confirme sua nova senha.';
        matchMessage.classList.remove('valid');
        matchMessage.classList.add('invalid');
      } else if (!passwordsMatch) {
        matchMessage.textContent = 'As senhas devem ser iguais.';
        matchMessage.classList.remove('valid');
        matchMessage.classList.add('invalid');
      } else {
        matchMessage.textContent = 'Senhas iguais. Está pronto para salvar.';
        matchMessage.classList.remove('invalid');
        matchMessage.classList.add('valid');
      }
    }

    if (saveButton) {
      saveButton.disabled = !passwordsMatch || !requirementsValid;
    }
  }

  function showSuccess() {
    if (subEmail) subEmail.classList.add('hidden');
    if (subSuccess) subSuccess.classList.remove('hidden');
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      updateStrengthIndicator();
      updateMatchState();
    });
  }

  if (confirmInput) {
    confirmInput.addEventListener('input', updateMatchState);
  }

  if (visibilityButtons) {
    visibilityButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const targetId = button.getAttribute('data-target');
        if (!targetId) return;

        const targetInput = document.getElementById(targetId);
        if (!targetInput) return;

        const currentlyHidden = targetInput.type === 'password';
        targetInput.type = currentlyHidden ? 'text' : 'password';
        button.textContent = currentlyHidden ? 'Ocultar' : 'Mostrar';
      });
    });
  }

  if (passwordForm) {
    passwordForm.addEventListener('submit', async (e) => {

        e.preventDefault();

        const password =
            passwordInput?.value || '';

        const confirmPassword =
            confirmInput?.value || '';

        if (password !== confirmPassword) {

            alert(
                'As senhas não coincidem. Corrija antes de salvar.'
            );

            return;
        }

        if (
            password.length < 8 ||
            !/[A-Z]/.test(password) ||
            !/[0-9]/.test(password) ||
            !/[^A-Za-z0-9]/.test(password)
        ) {

            alert(
                'A senha deve ter pelo menos 8 caracteres, incluir letra maiúscula, número e caractere especial.'
            );

            return;
        }

        const { error } =
            await supabaseClient.auth.updateUser({

                password: password

            });

        if (error) {

            alert(
                'Erro: ' + error.message
            );

            return;
        }

        showSuccess();

        setTimeout(() => {

            window.location.href =
                '../pages/index.html';

        }, 2000);

  });
  }

  updateStrengthIndicator();
  updateMatchState();
});
