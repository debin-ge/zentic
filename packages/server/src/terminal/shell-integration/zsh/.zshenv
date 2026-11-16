typeset -g ZENTIC_SHELL_INTEGRATION_DIR="${${(%):-%N}:A:h}"

if [[ -n "${ZENTIC_ZSH_ZDOTDIR-}" ]]; then
  export ZDOTDIR="${ZENTIC_ZSH_ZDOTDIR}"
else
  unset ZDOTDIR
fi

if [[ -n "${ZDOTDIR-}" ]]; then
  if [[ -f "${ZDOTDIR}/.zshenv" ]]; then
    source "${ZDOTDIR}/.zshenv"
  fi
elif [[ -f "${HOME}/.zshenv" ]]; then
  source "${HOME}/.zshenv"
fi

source "${ZENTIC_SHELL_INTEGRATION_DIR}/zentic-integration.zsh"
