local Plug = vim.fn['plug#']

vim.call('plug#begin')
Plug('morhetz/gruvbox')
vim.call('plug#end')

vim.opt.relativenumber = true
vim.opt.swapfile = false

vim.opt.smartindent = true
vim.opt.tabstop = 4
vim.opt.softtabstop = 4
vim.opt.shiftwidth = 4
vim.opt.expandtab = true

vim.opt.hlsearch = false
vim.opt.incsearch = true

vim.cmd.colorscheme('gruvbox')
