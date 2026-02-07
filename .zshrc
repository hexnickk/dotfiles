# History - bigger, save immediately, no duplicates
HISTSIZE=10000
SAVEHIST=10000
setopt appendhistory
setopt inc_append_history
setopt hist_ignore_all_dups

# Tab completion
autoload -Uz compinit && compinit

# Local binaries
export PATH="$PATH:$HOME/.local/bin"
export PATH="$PATH:$HOME/scripts"

# Disable git hooks globally
export GIT_CONFIG_PARAMETERS="'core.hooksPath=/dev/null'"

# nvm
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"

# fzf
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

# Prompt
eval "$(starship init zsh)"

# Aliases
alias opus='claude --model opus'
alias opusplan='claude --model opusplan'
alias fkill='ps aux | fzf | awk "{print \$2}" | xargs kill'
alias vim='nvim'
