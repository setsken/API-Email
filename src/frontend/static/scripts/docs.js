// Adds a copy button to every code block of the API documentation
document.querySelectorAll('.docs-main pre').forEach(pre => {
    const block = document.createElement('div');
    block.className = 'code-block';
    pre.replaceWith(block);
    block.append(pre);

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'copy-code';
    button.textContent = 'Копировать';
    block.append(button);

    button.addEventListener('click', () => {
        navigator.clipboard.writeText(pre.textContent).then(() => {
            button.textContent = 'Скопировано';
            button.classList.add('copied');
            setTimeout(() => {
                button.textContent = 'Копировать';
                button.classList.remove('copied');
            }, 1200);
        });
    });
});
