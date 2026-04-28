# hexnickk dotfiles

## Installationn

```bash
# zsh
ln -sfn "$PWD/.zshrc" "$HOME/.zshrc"

# tmux
ln -sfn "$PWD/.tmux.conf" "$HOME/.tmux.conf"

# nvim
mkdir -p "$HOME/.config/nvim"
ln -sfn "$PWD/nvim/init.lua" "$HOME/.config/nvim/init.lua"

# ghostty
mkdir -p "$HOME/Library/Application Support/com.mitchellh.ghostty"
ln -sfn "$PWD/ghostty/config" "$HOME/Library/Application Support/com.mitchellh.ghostty/config"

# vscode
mkdir -p "$HOME/Library/Application Support/Code/User"
ln -sfn "$PWD/vscode/settings.json" "$HOME/Library/Application Support/Code/User/settings.json"
ln -sfn "$PWD/vscode/keybindings.json" "$HOME/Library/Application Support/Code/User/keybindings.json"

# pi
mkdir -p "$HOME/.pi/agent/extensions"
ln -sfn "$PWD/.pi/extensions/guards" "$HOME/.pi/agent/extensions/guards"
```
