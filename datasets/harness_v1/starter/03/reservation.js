const reservations = [
  { date: '周六 09:00', seats: 2 },
  { date: '周六 10:30', seats: 0 },
  { date: '周日 08:00', seats: 1 },
  { date: '周日 16:00', seats: 0 },
];

const list = document.getElementById('slots');
for (const slot of reservations) {
  const item = document.createElement('li');
  item.dataset.date = slot.date;
  item.textContent = slot.date;
  if (slot.seats) {
    const button = document.createElement('button');
    button.textContent = '预约';
    button.onclick = () => {
      document.getElementById('confirmation').textContent = '已选 ' + slot.date;
    };
    item.append(button);
  } else {
    item.append(' · 已满');
  }
  list.append(item);
}
