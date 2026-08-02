// Fixture cho tooling/test-hooks.mjs — KHÔNG phải test thật của project.
// protect-tests.mjs đếm test block và assertion trong file này để so sánh.
// Đừng đổi số lượng bên dưới nếu chưa cập nhật case trong test-hooks.mjs.
//
// 3 test block (describe + 2 it) · 3 assertion

describe('fixture', () => {
  it('case một', () => {
    expect(1).toBe(1);
    expect(2).toBe(2);
  });

  it('case hai', () => {
    expect(3).toBe(3);
  });
});
