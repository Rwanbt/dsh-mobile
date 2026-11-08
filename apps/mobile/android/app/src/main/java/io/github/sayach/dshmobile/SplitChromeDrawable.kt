package io.github.sayach.dshmobile

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.drawable.Drawable

/** Paints two opaque chrome colours split at a relative fraction of the bounds. */
internal class SplitChromeDrawable(
    private var fraction: Float,
    private var leftColor: Int,
    private var rightColor: Int,
) : Drawable() {
    private val paint = Paint().apply { isAntiAlias = false }

    override fun draw(canvas: Canvas) {
        val width = bounds.width().toFloat()
        val height = bounds.height().toFloat()
        if (width <= 0f || height <= 0f) return
        val split = width * fraction.coerceIn(0f, 1f)
        paint.color = leftColor
        if (split > 0f) canvas.drawRect(0f, 0f, split, height, paint)
        paint.color = rightColor
        if (split < width) canvas.drawRect(split, 0f, width, height, paint)
    }

    override fun setAlpha(alpha: Int) {
        paint.alpha = alpha
    }

    override fun setColorFilter(colorFilter: ColorFilter?) {
        paint.colorFilter = colorFilter
    }

    @Deprecated("Deprecated in Java")
    override fun getOpacity(): Int = PixelFormat.OPAQUE
}
