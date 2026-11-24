export default function decorate(block) {
  const list = document.createElement('ul');
  [...block.children].forEach((row) => {
    const item = document.createElement('li');
    item.append(...row.childNodes);
    [...item.children].forEach((cell) => {
      cell.classList.add(cell.querySelector('picture') ? 'cards-card-image' : 'cards-card-body');
    });
    list.append(item);
    row.remove();
  });
  block.append(list);
  block.dataset.decorated = 'cards';
}
