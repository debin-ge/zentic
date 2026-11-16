if [[ -n "${_ZENTIC_ZSH_INTEGRATION_LOADED-}" ]]; then
  return
fi
typeset -g _ZENTIC_ZSH_INTEGRATION_LOADED=1

autoload -Uz add-zsh-hook

typeset -g _ZENTIC_ZSH_COMMAND_ACTIVE=0

function _zentic_osc633() {
  printf '\e]633;%s\a' "$1"
}

function _zentic_precmd() {
  local command_status=$?
  if [[ "$_ZENTIC_ZSH_COMMAND_ACTIVE" == "1" ]]; then
    _zentic_osc633 "D;${command_status}"
    _ZENTIC_ZSH_COMMAND_ACTIVE=0
  fi
  printf '\e]2;%s\a' "${PWD/#$HOME/~}"
  _zentic_osc633 "A"
}

function _zentic_preexec() {
  _ZENTIC_ZSH_COMMAND_ACTIVE=1
  _zentic_osc633 "B"
  _zentic_osc633 "C"
  printf '\e]2;%s\a' "$1"
}

add-zsh-hook precmd _zentic_precmd
add-zsh-hook preexec _zentic_preexec
