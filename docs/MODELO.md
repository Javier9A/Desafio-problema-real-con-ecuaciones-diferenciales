# Modelo matemático de SportLift

**Aviso:** parámetros hipotéticos; modelo didáctico, no predicción fisiológica comprobada.

## 1. Formulación
- Variable independiente: *t* (semanas). Dependiente: *y(t)* (kg, 1RM).
- EDO: `dy/dt = k·I·(M − y) − δ·y`, condición inicial `y(0) = y₀`.
- Justificación: la ganancia es proporcional a la distancia al techo *M* (rendimientos decrecientes) y a la intensidad de entrenamiento *I*; −δy representa pérdida por fatiga o falta de continuidad.
- Supuestos: parámetros constantes en [0, T]; sin lesiones; cada levantamiento por separado.
- *I* = (adherencia/100)·min(sesiones, 6)/6 es una hipótesis de normalización.

## 2. Solución analítica
Con `λ = kI + δ > 0` y `c = kIM`: `y' + λy = c`. Factor integrante `e^{λt}`: `(y e^{λt})' = c e^{λt}` ⇒ `y e^{λt} = (c/λ)e^{λt} + K`.
Con `y_eq = c/λ` y `y(0)=y₀` ⇒ **`y(t) = y_eq + (y₀ − y_eq) e^{−λt}`**.

**Sustitución:** `y(0) = y₀` ✔. `y'(t) = −λ(y₀−y_eq)e^{−λt}`; `c − λy(t) = λy_eq − λy_eq − λ(y₀−y_eq)e^{−λt} = y'(t)` ✔.

**Tiempo hasta una meta** (y₀ < meta < y_eq): `t* = −(1/λ)·ln((meta − y_eq)/(y₀ − y_eq))`.

## 3. Métodos numéricos (f(t,y) = c − λy)
- **Heun:** `k₁=f(tₙ,yₙ)`, `k₂=f(tₙ+h, yₙ+hk₁)`, `yₙ₊₁ = yₙ + h/2 (k₁+k₂)`. Error global O(h²).
- **RK4:** `k₁=f(tₙ,yₙ)`, `k₂=f(tₙ+h/2, yₙ+hk₁/2)`, `k₃=f(tₙ+h/2, yₙ+hk₂/2)`, `k₄=f(tₙ+h, yₙ+hk₃)`, `yₙ₊₁ = yₙ + h/6 (k₁+2k₂+2k₃+k₄)`. Error global O(h⁴).
- Para esta EDO, un paso multiplica la desviación (y−y_eq) por `1 − z + z²/2` (Heun) o `1 − z + z²/2 − z³/6 + z⁴/24` (RK4), con `z = hλ`: son los primeros términos de `e^{−z}`. Estabilidad: Heun `z<2`, RK4 `z<≈2.785`.

## 4. Errores
- Absoluto: `|y_exacta − y_aprox|` (kg). Relativo %: `|y_exacta − y_aprox| / |y_exacta| · 100` (solo si y_exacta ≠ 0).
- Orden observado: `log₂(E(h)/E(h/2))`, E = error absoluto máximo.

## 5. Limitaciones
Parámetros hipotéticos (no ajustados a datos); la fuerza real depende de nutrición, sueño, técnica, periodización y variabilidad individual; los errores medidos son numéricos, no del modelo frente a la realidad. Con datos reales, *k* y *δ* podrían estimarse por regresión.
