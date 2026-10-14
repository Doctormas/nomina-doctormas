package com.doctormas.nomina;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Imprime un documento HTML con el diálogo nativo de Android, desde donde el
 * usuario elige "Guardar como PDF". Es lo que usa la app para los recibos,
 * resúmenes e informes (en la PC lo hace Electron con printToPDF).
 */
@CapacitorPlugin(name = "PdfPrint")
public class PdfPrintPlugin extends Plugin {

    // Se mantiene una referencia para que el WebView no sea recogido por el
    // recolector de basura antes de terminar de imprimir.
    private WebView vistaImpresion;

    @PluginMethod
    public void print(final PluginCall call) {
        final String html = call.getString("html", "");
        final String nombre = call.getString("jobName", "Documento");

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    vistaImpresion = new WebView(getActivity());
                    vistaImpresion.getSettings().setAllowFileAccess(false);
                    vistaImpresion.setWebViewClient(new WebViewClient() {
                        @Override
                        public void onPageFinished(WebView view, String url) {
                            PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                            PrintDocumentAdapter adaptador = view.createPrintDocumentAdapter(nombre);
                            PrintAttributes atributos = new PrintAttributes.Builder()
                                    .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                    .build();
                            pm.print(nombre, adaptador, atributos);
                            call.resolve();
                        }
                    });
                    vistaImpresion.loadDataWithBaseURL("https://localhost/", html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    call.reject("No se pudo abrir la impresión: " + e.getMessage());
                }
            }
        });
    }
}
